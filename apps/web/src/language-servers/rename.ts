import { highlightingFor, syntaxTree } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, showTooltip, type Tooltip, WidgetType } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { highlightTree } from '@lezer/highlight';
import type {
  DocumentHighlight,
  DocumentHighlightParams,
  PrepareRenameParams,
  PrepareRenameResult,
  RenameParams,
  WorkspaceEdit,
} from 'vscode-languageserver-protocol';
import { hint } from '@/components/code-editor/hint';

/**
 * A symbol being renamed.
 */
interface Renaming {
  from: number;
  to: number;
  /**
   * The symbol's name before renaming.
   */
  name: string;
  /**
   * The symbol's other occurrences in the file, which show the new name as it is typed.
   */
  occurrences: readonly { from: number; to: number }[];
  typed: string;
  /**
   * Whether the new name was sent to the server, and its edits are awaited.
   */
  pending: boolean;
  field: Field;
  hint: Tooltip;
}

const renaming = StateField.define<Renaming | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(startRenaming)) {
        value = effect.value;
      } else if (effect.is(stopRenaming)) {
        return null;
      } else if (value && effect.is(typeName)) {
        value = { ...value, typed: effect.value };
      } else if (value && effect.is(commitRenaming)) {
        value = { ...value, pending: true };
      }
    }

    if (!value || !tr.docChanged) {
      return value;
    }
    if (tr.changes.touchesRange(value.from, value.to)) {
      return null;
    }

    const from = tr.changes.mapPos(value.from);
    return {
      ...value,
      from,
      to: tr.changes.mapPos(value.to),
      occurrences: value.occurrences
        .filter((occurrence) => !tr.changes.touchesRange(occurrence.from, occurrence.to))
        .map((occurrence) => ({ from: tr.changes.mapPos(occurrence.from), to: tr.changes.mapPos(occurrence.to) })),
      hint: { ...value.hint, pos: from },
    };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) =>
      value === null
        ? Decoration.none
        : Decoration.set(
            [
              Decoration.replace({ widget: value.field }).range(value.from, value.to),
              ...value.occurrences.map(({ from, to }) =>
                Decoration.replace({ widget: new Occurrence(value.typed, value.field.classes) }).range(from, to),
              ),
            ],
            true,
          ),
    ),
    showTooltip.from(field, (value) => value?.hint ?? null),
  ],
});

const startRenaming = StateEffect.define<Renaming>();
const typeName = StateEffect.define<string>();
const commitRenaming = StateEffect.define<null>();
const stopRenaming = StateEffect.define<null>();

const message = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showMessage)) {
        if (effect.value === null) {
          return null;
        }

        const { pos, text } = effect.value;
        return {
          pos,
          above: true,
          create: () => ({
            dom: Object.assign(document.createElement('div'), {
              className: 'cm-lsp-rename-message',
              textContent: text,
            }),
          }),
        };
      }
    }
    return tr.docChanged || tr.selection ? null : value;
  },
  provide: (field) => showTooltip.from(field),
});

const showMessage = StateEffect.define<{ pos: number; text: string } | null>();

/**
 * The key that renames the symbol at the cursor.
 */
export const RENAME = 'Shift-F6';

/**
 * Returns the extension that renames the symbol at the cursor in place.
 *
 * It replaces `@codemirror/lsp-client`'s `renameKeymap`, which asks for the new name in a panel.
 */
export function serverRename(): LSPClientExtension {
  return {
    clientCapabilities: { textDocument: { rename: { prepareSupport: true }, documentHighlight: {} } },
    editorExtension: [
      renaming,
      message,
      Prec.high(
        keymap.of([
          { key: RENAME, run: rename, preventDefault: true },
          {
            key: 'Escape',
            run: (view) => {
              if (!view.state.field(message)) {
                return false;
              }
              view.dispatch({ effects: showMessage.of(null) });
              return true;
            },
          },
        ]),
      ),
    ],
  };
}

// Based on `@codemirror/lsp-client`'s `renameSymbol`, which renames the word at the cursor to a name typed in a panel.
export function rename(view: EditorView): boolean {
  const plugin = LSPPlugin.get(view);
  const provider = plugin?.client.serverCapabilities?.renameProvider;
  if (!plugin || !provider) {
    return false;
  }

  const { doc } = view.state;
  const pos = view.state.selection.main.head;
  const params = { position: plugin.toPosition(pos), textDocument: { uri: plugin.uri } };
  const word = view.state.wordAt(pos);
  plugin.client.sync();
  void (async () => {
    try {
      // Sends both requests before awaiting either.
      const preparing =
        typeof provider === 'object' && provider.prepareProvider
          ? plugin.client.request<PrepareRenameParams, PrepareRenameResult | null>('textDocument/prepareRename', params)
          : null;
      const highlighting = plugin.client.serverCapabilities?.documentHighlightProvider
        ? plugin.client
            .request<DocumentHighlightParams, DocumentHighlight[] | null>('textDocument/documentHighlight', params)
            .catch(() => null)
        : null;

      let range: { from: number; to: number; placeholder?: string } | null = word;
      if (preparing) {
        const result = await preparing;
        if (result == null || 'defaultBehavior' in result) {
          range = result?.defaultBehavior ? word : null;
        } else {
          const prepared = 'range' in result ? result.range : result;
          range = {
            from: plugin.fromPosition(prepared.start, doc),
            to: plugin.fromPosition(prepared.end, doc),
            placeholder: 'placeholder' in result ? result.placeholder : undefined,
          };
        }
      }
      const highlights = await highlighting;

      // Gives up when the document changed while the server was asked, since the ranges no longer fit it.
      if (view.state.doc !== doc) {
        return;
      }
      if (range === null) {
        view.dispatch({ effects: showMessage.of({ pos, text: "This can't be renamed" }) });
        return;
      }

      const { from, to } = range;
      const name = doc.sliceString(from, to);
      const occurrences = (highlights ?? [])
        .map((highlight) => ({
          from: plugin.fromPosition(highlight.range.start, doc),
          to: plugin.fromPosition(highlight.range.end, doc),
        }))
        .filter((occurrence) => occurrence.to <= from || occurrence.from >= to)
        .filter((occurrence) => doc.sliceString(occurrence.from, occurrence.to) === name);

      // The symbol's token classes, to keep its colour while it is typed.
      let classes = '';
      highlightTree(
        syntaxTree(view.state),
        { style: (tags) => highlightingFor(view.state, tags) },
        (start, _end, style) => {
          if (start <= from) {
            classes = style;
          }
        },
        from,
        to,
      );

      const typed = range.placeholder ?? name;
      view.dispatch({
        effects: startRenaming.of({
          from,
          to,
          name,
          occurrences,
          typed,
          pending: false,
          field: new Field(typed, classes),
          hint: {
            pos: from,
            above: true,
            create: () => ({
              dom: hint('cm-lsp-rename-hint', [
                ['Enter', 'rename'],
                ['Escape', 'cancel'],
              ]),
            }),
          },
        }),
      });
    } catch (error) {
      if (view.state.doc === doc) {
        view.dispatch({
          effects: showMessage.of({ pos, text: (error as { message?: string }).message ?? String(error) }),
        });
      }
    }
  })();
  return true;
}

/**
 * Sends the typed name to the server, and applies its edits. `refocus` returns focus to the editor once they are
 * applied.
 */
function commit(view: EditorView, refocus: boolean): void {
  const value = view.state.field(renaming, false);
  const plugin = LSPPlugin.get(view);
  if (!value || value.pending) {
    return;
  }
  if (!plugin || value.typed === '' || value.typed === value.name) {
    stop(view, refocus);
    return;
  }

  view.dispatch({ effects: commitRenaming.of(null) });
  plugin.client.sync();
  // Copied from `@codemirror/lsp-client`'s `doRename`.
  //
  // Applies the edits to this file along with stopping, so the widgets give way to them at once, and reports errors in a
  // toast.
  plugin.client.withMapping(async (mapping) => {
    try {
      const response = await plugin.client.request<RenameParams, WorkspaceEdit | null>('textDocument/rename', {
        newName: value.typed,
        position: plugin.toPosition(value.from),
        textDocument: { uri: plugin.uri },
      });

      let changes: { from: number; to: number; insert: string }[] = [];
      for (const [uri, edits] of Object.entries(response?.changes ?? {})) {
        const file = plugin.client.workspace.getFile(uri);
        if (!edits.length || !file) {
          continue;
        }

        const mapped = edits.map((edit) => ({
          from: mapping.mapPosition(uri, edit.range.start),
          to: mapping.mapPosition(uri, edit.range.end),
          insert: edit.newText,
        }));
        if (uri === plugin.uri) {
          changes = mapped;
        } else {
          plugin.client.workspace.updateFile(uri, { changes: mapped, userEvent: 'rename' });
        }
      }

      view.dispatch({ changes, effects: stopRenaming.of(null), userEvent: 'rename' });
      if (refocus) {
        view.focus();
      }
    } catch (error) {
      stop(view, refocus);
      toast.add({ type: 'error', title: 'Rename request failed', description: (error as Error).message });
    }
  });
}

function stop(view: EditorView, refocus: boolean): void {
  if (view.state.field(renaming, false)) {
    view.dispatch({ effects: stopRenaming.of(null) });
  }
  if (refocus) {
    view.focus();
  }
}

/**
 * The field the new name is typed in, in place of the symbol.
 */
class Field extends WidgetType {
  constructor(
    private readonly value: string,
    readonly classes: string,
  ) {
    super();
  }

  // Keeps the input, and its focus, while the name is typed.
  override eq(other: WidgetType): boolean {
    return other === this;
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('span');
    dom.className = 'cm-lsp-rename-field';
    dom.contentEditable = 'false';
    const input = dom.appendChild(document.createElement('input'));
    input.className = this.classes;
    input.value = this.value;
    input.spellcheck = false;
    input.ariaLabel = 'New name';

    input.addEventListener('input', () => {
      if (view.state.field(renaming, false)?.pending) {
        return;
      }
      view.dispatch({ effects: typeName.of(input.value) });
      view.requestMeasure();
    });
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        input.readOnly = true;
        commit(view, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        stop(view, true);
      }
    });
    input.addEventListener('blur', () => {
      if (view.state.field(renaming, false)?.field === this) {
        input.readOnly = true;
        commit(view, false);
      }
    });

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return dom;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Another occurrence of the symbol, showing the typed name.
 */
class Occurrence extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly classes: string,
  ) {
    super();
  }

  override eq(other: Occurrence): boolean {
    return other.text === this.text && other.classes === this.classes;
  }

  toDOM(): HTMLElement {
    const dom = document.createElement('span');
    dom.className = 'cm-lsp-rename-occurrence';
    dom.appendChild(Object.assign(document.createElement('span'), { className: this.classes, textContent: this.text }));
    return dom;
  }
}
