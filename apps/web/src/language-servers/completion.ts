import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionStatus,
  insertCompletionText,
  pickedCompletion,
  snippet,
} from '@codemirror/autocomplete';
import { highlightingFor } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import {
  type ChangeDesc,
  type ChangeSpec,
  CharCategory,
  EditorState,
  Facet,
  MapMode,
  Prec,
  StateEffect,
  StateField,
  type Text,
} from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';
import { letterformClass } from '@elsewise/components/components/letter-icon';
import { cn } from '@elsewise/components/lib/utils';
import { type Tag, tags as t } from '@lezer/highlight';
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
import { documentation } from '@/language-servers/documentation';

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
 * The letters of each completion type's tile, and the syntax tag it is colored like. Types are uppercase, values
 * lowercase. CodeMirror's own types are included for completions that come from elsewhere.
 */
const TILES = new Map<string, readonly [letters: string, tag: Tag | null]>([
  ['class', ['C', t.typeName]],
  ['struct', ['S', t.typeName]],
  ['interface', ['I', t.typeName]],
  ['enum', ['E', t.typeName]],
  ['type-parameter', ['T', t.typeName]],
  ['type', ['T', t.typeName]],
  ['module', ['M', t.namespace]],
  ['namespace', ['M', t.namespace]],
  ['method', ['m', t.function(t.propertyName)]],
  ['function', ['f', t.function(t.variableName)]],
  ['constructor', ['f', t.function(t.variableName)]],
  ['field', ['p', t.propertyName]],
  ['property', ['p', t.propertyName]],
  ['variable', ['v', t.variableName]],
  ['value', ['v', t.variableName]],
  ['constant', ['c', t.constant(t.name)]],
  ['enum-member', ['e', t.constant(t.name)]],
  ['keyword', ['k', t.keyword]],
  ['snippet', ['{}', null]],
]);

const OTHER = ['t', null] as const;

/**
 * Whether completions show the selected item's documentation beside the list, true unless set.
 */
export const completionDocumentation = Facet.define<boolean, boolean>({ combine: (values) => values.at(-1) ?? true });
/**
 * Whether the next picked completion replaces the rest of the word after the cursor.
 */
const replacing = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => tr.effects.find((effect) => effect.is(setReplacing))?.value ?? value,
});

const setReplacing = StateEffect.define<boolean>();

/**
 * A completion with what a server says about it beyond CodeMirror's {@link Completion}.
 */
export interface ServerCompletion extends Completion {
  deprecated?: boolean;
  /** The text shown right after the label, such as the parameters or where an import comes from. */
  tail?: string;
}

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
 * Returns the client extension that completes code from the server's suggestions.
 *
 * It replaces `@codemirror/lsp-client`'s `serverCompletion()`, which drops an item's kind, label details and
 * deprecation, and never resolves its documentation or additional edits.
 */
export function serverCompletion(): LSPClientExtension {
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
    editorExtension: [
      EditorState.languageData.of(() => [{ autocomplete: source }]),
      autocompletion({
        icons: false,
        addToOptions: [
          { position: 20, render: tile },
          { position: 51, render: tail },
        ],
        optionClass: (completion: ServerCompletion) => (completion.deprecated ? 'cm-completion-deprecated' : ''),
      }),
      replacing,
      Prec.highest(keymap.of([{ key: 'Tab', run: replace }])),
      EditorState.transactionFilter.of((tr) => {
        if (!tr.startState.field(replacing) || !tr.annotation(pickedCompletion)) {
          return tr;
        }

        const state = tr.startState;
        const pos = state.selection.main.head;
        const word = state.charCategorizer(pos);
        let end = pos;
        while (end < state.doc.lineAt(pos).to && word(state.sliceDoc(end, end + 1)) === CharCategory.Word) {
          end++;
        }

        const changes = end === pos ? [] : { from: tr.changes.mapPos(pos, 1), to: tr.changes.mapPos(end, 1) };
        return [tr, { changes, effects: setReplacing.of(false), sequential: true }];
      }),
    ],
  };
}

// Copied from `@codemirror/lsp-client`'s `serverCompletionSource`.
//
// Keeps an item's kind, label details and deprecation, resolves its documentation when shown and its additional edits
// when picked, and shows its detail above the documentation. Has no `validFor` option.
async function source(context: CompletionContext): Promise<CompletionResult | null> {
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
  const defaults = list.itemDefaults;
  const documented = context.state.facet(completionDocumentation);
  const options = list.items.map((item): ServerCompletion => {
    const text = item.textEdit?.newText || item.textEditText || item.insertText || item.label;
    const option: ServerCompletion = {
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
    } else if (item.additionalTextEdits || provider.resolveProvider) {
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

  const { from, to } = range(context, list);
  return {
    from,
    to,
    options,
    commitCharacters: defaults?.commitCharacters,
    validFor: list.isIncomplete ? undefined : prefix(list.items),
  };
}

function tile(completion: Completion, state: EditorState): Node {
  const dom = document.createElement('span');
  const type = completion.type?.split(' ')[0];
  if (type === undefined) {
    dom.className = 'cm-completionKind';
    return dom;
  }

  const [letters, tag] = TILES.get(type) ?? OTHER;
  const highlight = tag === null ? null : highlightingFor(state, [tag]);
  dom.className = cn(letterformClass(letters), 'cm-completionKind font-sans text-[11px]/none', highlight);
  dom.textContent = letters;
  dom.style.borderColor = 'color-mix(in srgb, currentColor 45%, transparent)';
  return dom;
}

function tail(completion: ServerCompletion): Node | null {
  if (!completion.tail) {
    return null;
  }

  const dom = document.createElement('span');
  dom.className = 'cm-completionTail';
  dom.textContent = completion.tail;
  return dom;
}

// Picks the selected completion over the rest of the word after the cursor.
function replace(view: EditorView): boolean {
  if (completionStatus(view.state) !== 'active') {
    return false;
  }

  view.dispatch({ effects: setReplacing.of(true) });
  const picked = acceptCompletion(view);
  // Clears it when nothing was picked, or a completion applied itself without saying so.
  if (view.state.field(replacing)) {
    view.dispatch({ effects: setReplacing.of(false) });
  }
  return picked;
}

// Returns the offset of `position` in `doc`, or null if it is outside it.
//
// Copied from `@codemirror/lsp-client`'s `fromPositionChecked`.
function offset(doc: Text, position: { line: number; character: number }): number | null {
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
function range(context: CompletionContext, list: CompletionList): { from: number; to: number } {
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
function prefix(items: CompletionItem[]): RegExp {
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

// Returns an apply that inserts `text`, or a snippet of `template`, and makes the item's additional edits.
//
// Based on `@codemirror/lsp-client`'s `applyEdits`. The edits are in the document the server has. They are made with
// the text when known by then, so that they are undone together, else after it once the item is resolved.
function apply(resolvable: Resolvable, text: string, template: string | null): Completion['apply'] {
  return (view, completion, from, to) => {
    const plugin = LSPPlugin.get(view);
    const known = resolvable.item.additionalTextEdits ? resolvable.item : resolvable.resolved;
    if (!plugin || (known && template === null)) {
      const changes = plugin ? edits(plugin.syncedDoc, plugin.unsyncedChanges, known?.additionalTextEdits ?? []) : [];
      view.dispatch(insertCompletionText(view.state, text, from, to), {
        changes,
        annotations: pickedCompletion.of(completion),
      });
      return;
    }

    // Tracks the changes since the document the server has, including the text's.
    void plugin.client.withMapping(async (mapping) => {
      const doc = plugin.syncedDoc;
      if (template === null) {
        view.dispatch(insertCompletionText(view.state, text, from, to), {
          annotations: pickedCompletion.of(completion),
        });
      } else {
        snippet(template)(view, completion, from, to);
      }

      const { additionalTextEdits } = known ?? (await resolvable.resolve());
      if (!additionalTextEdits?.length || LSPPlugin.get(view) !== plugin) {
        return;
      }
      plugin.client.sync();
      const changes = mapping.getMapping(plugin.uri);
      if (changes) {
        view.dispatch({ changes: edits(doc, changes, additionalTextEdits) });
      }
    });
  };
}

// Returns the changes that make `lsp` in `doc`, mapped through `changes` since, without those whose range changed.
//
// Based on `@codemirror/lsp-client`'s `applyEdits`, which also drops an edit that a change only borders, such as one
// at the start of the text the completion replaces.
function edits(doc: Text, changes: ChangeDesc, lsp: TextEdit[]): ChangeSpec[] {
  const specs: ChangeSpec[] = [];
  for (const edit of lsp) {
    const from = offset(doc, edit.range.start);
    const to = offset(doc, edit.range.end);
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
