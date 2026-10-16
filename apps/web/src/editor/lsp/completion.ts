import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  insertCompletionText,
  pickedCompletion,
  snippet,
} from '@codemirror/autocomplete';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { type ChangeDesc, type ChangeSpec, EditorState, MapMode, type Text } from '@codemirror/state';
import { toast } from '@elsewise/components/components/toast';
import type { EditorCompletion, LanguageServer } from '@elsewise/plugin';
import {
  type CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  type CompletionList,
  type CompletionParams,
  CompletionTriggerKind,
  InsertTextFormat,
  LSPErrorCodes,
  type TextEdit,
} from 'vscode-languageserver-protocol';
import { completionDocumentation } from '@/editor/completion';
import { documentation } from '@/editor/lsp/documentation';
import { run } from '@/editor/lsp/language-servers';

/**
 * The completion type of each kind of item.
 */
const KINDS = {
  [CompletionItemKind.Text]: 'text',
  [CompletionItemKind.Method]: 'method',
  [CompletionItemKind.Function]: 'function',
  [CompletionItemKind.Constructor]: 'constructor',
  [CompletionItemKind.Field]: 'field',
  [CompletionItemKind.Variable]: 'variable',
  [CompletionItemKind.Class]: 'class',
  [CompletionItemKind.Interface]: 'interface',
  [CompletionItemKind.Module]: 'module',
  [CompletionItemKind.Property]: 'property',
  [CompletionItemKind.Unit]: 'unit',
  [CompletionItemKind.Value]: 'value',
  [CompletionItemKind.Enum]: 'enum',
  [CompletionItemKind.Keyword]: 'keyword',
  [CompletionItemKind.Snippet]: 'snippet',
  [CompletionItemKind.Color]: 'color',
  [CompletionItemKind.File]: 'file',
  [CompletionItemKind.Reference]: 'reference',
  [CompletionItemKind.Folder]: 'folder',
  [CompletionItemKind.EnumMember]: 'enum-member',
  [CompletionItemKind.Constant]: 'constant',
  [CompletionItemKind.Struct]: 'struct',
  [CompletionItemKind.Event]: 'event',
  [CompletionItemKind.Operator]: 'operator',
  [CompletionItemKind.TypeParameter]: 'type-parameter',
} as const satisfies Record<CompletionItemKind, string>;

/**
 * A server's completion item, resolved at most once, when shown or picked.
 */
interface Resolvable {
  item: CompletionItem;
  /** The item once resolved, or the item itself when the server can't resolve it. */
  resolved?: CompletionItem;
  resolve(): Promise<CompletionItem>;
}

/**
 * Returns the client extension that completes code from `server`'s suggestions.
 *
 * It replaces `@codemirror/lsp-client`'s `serverCompletion()`, which drops an item's kind, label details and
 * deprecation, never resolves its documentation or additional edits, and never runs its command.
 */
export function serverCompletion(server: LanguageServer): LSPClientExtension {
  const source = (context: CompletionContext) => serverCompletionSource(context, server);
  return {
    clientCapabilities: {
      textDocument: {
        completion: {
          completionItem: {
            deprecatedSupport: true,
            tagSupport: { valueSet: [CompletionItemTag.Deprecated] },
            labelDetailsSupport: true,
            resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
          },
          completionItemKind: {
            // `@codemirror/lsp-client` merges an array into its default `[]` as an object, but keeps an object's
            // `toJSON`.
            valueSet: { toJSON: () => Object.keys(KINDS).map(Number) },
          },
        },
      },
    },
    editorExtension: [EditorState.languageData.of(() => [{ autocomplete: source }])],
  };
}

// Copied from `@codemirror/lsp-client`'s `serverCompletionSource`.
//
// Keeps an item's kind, label details and deprecation, resolves its documentation when shown and its additional edits
// when picked, and shows its detail above the documentation. Has no `validFor` option. Lets `server` change the items
// first.
async function serverCompletionSource(
  context: CompletionContext,
  server: LanguageServer,
): Promise<CompletionResult | null> {
  const plugin = context.view && LSPPlugin.get(context.view);
  const provider = plugin?.client.serverCapabilities?.completionProvider;
  if (!plugin || !provider) {
    return null;
  }

  const character = context.state.sliceDoc(context.pos - 1, context.pos);
  const triggered = !context.explicit && provider.triggerCharacters?.includes(character);
  if (!context.explicit && !triggered && !/[a-zA-Z_]/.test(character)) {
    return null;
  }

  plugin.client.sync();
  const params: CompletionParams = {
    position: plugin.toPosition(context.pos),
    textDocument: { uri: plugin.uri },
    context: triggered
      ? { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: character }
      : { triggerKind: CompletionTriggerKind.Invoked },
  };
  context.addEventListener('abort', () => plugin.client.cancelRequest(params));

  let result: CompletionItem[] | CompletionList | null;
  try {
    result = await plugin.client.request<CompletionParams, CompletionItem[] | CompletionList | null>(
      'textDocument/completion',
      params,
    );
  } catch (error) {
    if ((error as { code?: number }).code === LSPErrorCodes.RequestCancelled) {
      return null;
    }
    throw error;
  }

  if (result == null) {
    return null;
  }

  const list: CompletionList = Array.isArray(result) ? { isIncomplete: false, items: result } : result;
  if (server.completionItems) {
    list.items = await server.completionItems(plugin.client, list.items, params);
  }

  const defaults = list.itemDefaults;
  const documented = context.state.facet(completionDocumentation);
  const options = list.items.map((item): EditorCompletion => {
    const text = item.textEdit?.newText || item.textEditText || item.insertText || item.label;
    const option: EditorCompletion = {
      label: item.filterText || item.label,
      displayLabel: item.filterText && item.filterText !== item.label ? item.label : undefined,
      type: item.kind && KINDS[item.kind],
      detail: item.labelDetails?.description ?? item.detail,
      tail: item.labelDetails?.detail,
      deprecated: item.deprecated || item.tags?.includes(CompletionItemTag.Deprecated),
      sortText: item.sortText,
    };

    if (item.commitCharacters && item.commitCharacters !== defaults?.commitCharacters) {
      option.commitCharacters = item.commitCharacters;
    }

    let resolving: Promise<CompletionItem> | undefined;
    const resolvable: Resolvable = {
      item,
      resolved: provider.resolveProvider ? undefined : item,
      resolve: () =>
        (resolving ??= (
          provider.resolveProvider
            ? plugin.client.request<CompletionItem, CompletionItem>('completionItem/resolve', item).catch(() => item)
            : Promise.resolve(item)
        ).then((resolved) => (resolvable.resolved = resolved))),
    };

    if ((item.insertTextFormat ?? defaults?.insertTextFormat) === InsertTextFormat.Snippet) {
      // Turns LSP's `$1` tab stops into CodeMirror's `${1}`, and unescapes the rest as `@codemirror/lsp-client` does.
      const template = text.replace(/\\([$}\\])|\$(\d+)/g, (_, escaped, field) => escaped || `\${${field}}`);
      option.apply = apply(resolvable, text, template);
    } else if (item.additionalTextEdits || provider.resolveProvider || item.command) {
      option.apply = apply(resolvable, text, null);
    } else if (option.label !== text) {
      option.apply = text;
    }

    if (documented) {
      option.info = async () => {
        const { detail, documentation: docs } = item.documentation === undefined ? await resolvable.resolve() : item;
        return documentation(plugin, docs, detail && detail !== item.label ? [detail] : []);
      };
    }

    return option;
  });

  const { from, to } = completionResultRange(context, list);
  return {
    from,
    to,
    options,
    commitCharacters: defaults?.commitCharacters,
    validFor: list.isIncomplete ? undefined : prefixRegexp(list.items),
  };
}

// Returns the offset of `position` in `doc`, or null if it is outside it.
//
// Copied from `@codemirror/lsp-client`'s `fromPositionChecked`.
function fromPositionChecked(doc: Text, position: { line: number; character: number }): number | null {
  if (position.line < 0 || position.line >= doc.lines) {
    return null;
  }
  const line = doc.line(position.line + 1);
  return position.character < 0 || position.character > line.length ? null : line.from + position.character;
}

// Returns the range the items replace: the defaults' or first item's edit range, else the word before the cursor.
//
// Copied from `@codemirror/lsp-client`'s `completionResultRange`.
//
// Falls back to the word before the cursor instead of the whole word, since Tab replaces the rest.
function completionResultRange(context: CompletionContext, list: CompletionList): { from: number; to: number } {
  if (list.items.length === 0) {
    return { from: context.pos, to: context.pos };
  }

  const defaults = list.itemDefaults?.editRange;
  const edit = list.items[0].textEdit;
  const lsp = defaults
    ? 'insert' in defaults
      ? defaults.insert
      : defaults
    : edit
      ? 'range' in edit
        ? edit.range
        : edit.insert
      : null;
  if (lsp === null) {
    // Up to the cursor only, since the rest of the word is replaced by Tab.
    return { from: context.matchBefore(/\w*/)?.from ?? context.pos, to: context.pos };
  }

  const line = context.state.doc.lineAt(context.pos);
  return { from: line.from + lsp.start.character, to: line.from + lsp.end.character };
}

// Returns the pattern of the text that keeps the items valid while typing: a word, after the items' symbol prefixes.
//
// Copied from `@codemirror/lsp-client`'s `prefixRegexp`.
function prefixRegexp(items: CompletionItem[]): RegExp {
  const step = Math.ceil(items.length / 50);
  const prefixes = new Set<string>();
  for (let i = 0; i < items.length; i += step) {
    const item = items[i];
    const text = item.textEdit?.newText || item.textEditText || item.insertText || item.label;
    if (!/^\w/.test(text)) {
      prefixes.add(/^[^\w]*/.exec(text)?.[0] ?? '');
    }
  }

  if (prefixes.size === 0) {
    return /^\w*$/;
  }
  const escaped = [...prefixes].map((prefix) => prefix.replace(/[^\w\s]/g, '\\$&'));
  return new RegExp(`^(?:${escaped.join('|')})?\\w*$`);
}

// Copied from `@codemirror/lsp-client`'s `applyEdits`.
function apply(resolvable: Resolvable, text: string, template: string | null): Completion['apply'] {
  return (view, completion, from, to) => {
    const plugin = LSPPlugin.get(view);
    const finish = (plugin: LSPPlugin) => {
      const command = resolvable.resolved?.command ?? resolvable.item.command;
      if (command) {
        run(view, plugin, command).catch((error) => {
          toast.add({ type: 'error', title: 'Command failed', description: (error as Error).message });
        });
      }
    };

    const inline = resolvable.item.additionalTextEdits ? resolvable.item : resolvable.resolved;
    if (!plugin || (inline && template === null)) {
      const changes = plugin ? edits(plugin.syncedDoc, plugin.unsyncedChanges, inline?.additionalTextEdits ?? []) : [];
      view.dispatch(insertCompletionText(view.state, text, from, to), {
        changes,
        annotations: pickedCompletion.of(completion),
      });

      if (plugin) {
        finish(plugin);
      }
      return;
    }

    // Maps the additional edits since their positions are in the document the server had before the insertion.
    void plugin.client.withMapping(async (mapping) => {
      const doc = plugin.syncedDoc;
      if (template === null) {
        view.dispatch(insertCompletionText(view.state, text, from, to), {
          annotations: pickedCompletion.of(completion),
        });
      } else {
        snippet(template)(view, completion, from, to);
      }

      const { additionalTextEdits } = inline ?? (await resolvable.resolve());
      if (LSPPlugin.get(view) !== plugin) {
        return;
      }

      if (additionalTextEdits?.length) {
        plugin.client.sync();
        const changes = mapping.getMapping(plugin.uri);
        if (changes) {
          view.dispatch({ changes: edits(doc, changes, additionalTextEdits) });
        }
      }
      finish(plugin);
    });
  };
}

// Returns the changes that make `lsp` in `doc`, mapped through `changes` since, without those whose range changed.
//
// Copied from `@codemirror/lsp-client`'s `applyEdits`, which also drops an edit that a change only borders, such as one
// at the start of the text the completion replaces.
function edits(doc: Text, changes: ChangeDesc, lsp: TextEdit[]): ChangeSpec[] {
  const specs: ChangeSpec[] = [];
  for (const edit of lsp) {
    const from = fromPositionChecked(doc, edit.range.start);
    const to = fromPositionChecked(doc, edit.range.end);
    if (from === null || to === null) {
      continue;
    }

    const start = changes.mapPos(from, -1, MapMode.TrackDel);
    const end = changes.mapPos(to, 1, MapMode.TrackDel);
    if (start !== null && end !== null && end - start === to - from) {
      specs.push({ from: start, to: end, insert: edit.newText });
    }
  }
  return specs;
}
