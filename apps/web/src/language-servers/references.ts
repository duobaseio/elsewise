import { highlightingFor, syntaxTree } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { EditorSelection, type EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { FileIcon } from '@elsewise/components/components/file-icon';
import { highlightTree } from '@lezer/highlight';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Location, ReferenceParams } from 'vscode-languageserver-protocol';
import { hint } from '@/components/code-editor/hint';
import { scroll } from '@/components/code-editor/scroll';

/**
 * A usage of the symbol.
 */
interface Usage {
  uri: string;
  /**
   * The file's name, e.g. `main.rs`.
   */
  file: string;
  line: number;
  /**
   * Where the usage is in its file, or `null` if the file isn't open.
   */
  range: { from: number; to: number } | null;
  /**
   * The usage's line, highlighted, or `null` if the file isn't open.
   */
  preview: HTMLElement | null;
}

/**
 * The usages of the symbol shown in the popup.
 */
interface Usages {
  name: string;
  usages: readonly Usage[];
  selected: number;
  tooltip: Tooltip;
}

const usages = StateField.define<Usages | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showUsages)) {
        return effect.value;
      } else if (effect.is(closeUsages)) {
        return null;
      } else if (value && effect.is(selectUsage)) {
        value = { ...value, selected: effect.value };
      }
    }
    return tr.docChanged || tr.selection ? null : value;
  },
  provide: (field) => [
    showTooltip.from(field, (value) => value?.tooltip ?? null),
    EditorView.focusChangeEffect.of((state, focusing) =>
      !focusing && state.field(field, false) ? closeUsages.of(null) : null,
    ),
  ],
});

const showUsages = StateEffect.define<Usages>();
const selectUsage = StateEffect.define<number>();
const closeUsages = StateEffect.define<null>();

const showMessage = StateEffect.define<{ pos: number; text: string } | null>();

// Says why no usages are shown, until the cursor moves or the document changes.
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
              className: 'cm-lsp-references-message',
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

/**
 * The key that shows the usages of the symbol at the cursor.
 */
export const SHOW_USAGES = 'Mod-Alt-F7';

/**
 * Returns the extension that shows the usages of the symbol at the cursor in a popup.
 *
 * It replaces `@codemirror/lsp-client`'s `findReferencesKeymap`, which lists them in a panel.
 */
export function serverReferences(): LSPClientExtension {
  return {
    clientCapabilities: { textDocument: { references: {} } },
    editorExtension: [
      usages,
      message,
      Prec.high(
        keymap.of([
          { key: SHOW_USAGES, run: findUsages, preventDefault: true },
          { key: 'ArrowDown', run: (view) => move(view, (selected) => selected + 1, true) },
          { key: 'ArrowUp', run: (view) => move(view, (selected) => selected - 1, true) },
          { key: 'PageDown', run: (view) => move(view, (selected) => selected + 10, false) },
          { key: 'PageUp', run: (view) => move(view, (selected) => selected - 10, false) },
          { key: 'End', run: (view) => move(view, () => Number.POSITIVE_INFINITY, false) },
          { key: 'Home', run: (view) => move(view, () => Number.NEGATIVE_INFINITY, false) },
          {
            key: 'Enter',
            run: (view) => {
              const value = view.state.field(usages, false);
              if (!value) {
                return false;
              }
              open(view, value.usages[value.selected]);
              return true;
            },
          },
          {
            key: 'Escape',
            run: (view) => {
              if (view.state.field(usages, false)) {
                view.dispatch({ effects: closeUsages.of(null) });
                return true;
              }
              if (view.state.field(message, false)) {
                view.dispatch({ effects: showMessage.of(null) });
                return true;
              }
              return false;
            },
          },
        ]),
      ),
    ],
  };
}

// Based on `@codemirror/lsp-client`'s `findReferences`, which lists the references in a panel.
//
// Previews the usages in open files when they arrive, and lists the rest by file and line rather than dropping them.
export function findUsages(view: EditorView): boolean {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.serverCapabilities?.referencesProvider) {
    return false;
  }

  const { doc } = view.state;
  const pos = view.state.selection.main.head;
  plugin.client.sync();
  plugin.client.withMapping(async (mapping) => {
    try {
      const locations = await plugin.client.request<ReferenceParams, Location[] | null>('textDocument/references', {
        textDocument: { uri: plugin.uri },
        position: plugin.toPosition(pos),
        context: { includeDeclaration: true },
      });

      // Gives up when the document changed while the server was asked, since the ranges no longer fit it.
      if (view.state.doc !== doc) {
        return;
      }

      const found = (locations ?? [])
        .map((location): Usage => {
          const file = decodeURIComponent(location.uri.slice(location.uri.lastIndexOf('/') + 1));
          const open = plugin.client.workspace.getFile(location.uri);
          // TODO: Preview and open usages in files that aren't open once the daemon can read them.
          if (!open) {
            return { uri: location.uri, file, line: location.range.start.line + 1, range: null, preview: null };
          }

          const from = mapping.mapPosition(location.uri, location.range.start, 1);
          const to = mapping.mapPosition(location.uri, location.range.end, -1);
          const state = location.uri === plugin.uri ? view.state : open.getView()?.state;
          const line = (state?.doc ?? open.doc).lineAt(from);
          return {
            uri: location.uri,
            file,
            line: line.number,
            range: { from, to },
            preview: preview(state, line, from, to),
          };
        })
        .sort(
          (a, b) =>
            Number(a.uri !== plugin.uri) - Number(b.uri !== plugin.uri) ||
            a.file.localeCompare(b.file) ||
            a.uri.localeCompare(b.uri) ||
            a.line - b.line ||
            (a.range?.from ?? 0) - (b.range?.from ?? 0),
        );

      const current = found.findIndex(
        ({ uri, range }) => uri === plugin.uri && range !== null && range.from <= pos && pos <= range.to,
      );
      const others = found.filter((_, i) => i !== current);
      if (others.length === 0) {
        view.dispatch({ effects: showMessage.of({ pos, text: 'No usages found' }) });
        return;
      }
      if (others.length === 1 && others[0].range !== null) {
        open(view, others[0]);
        return;
      }

      const symbol = current === -1 ? view.state.wordAt(pos) : found[current].range;
      const name = symbol ? doc.sliceString(symbol.from, symbol.to) : '';
      const value: Usages = {
        name,
        usages: found,
        selected:
          current === -1
            ? Math.max(
                0,
                found.findIndex((usage) => usage.range !== null),
              )
            : current,
        tooltip: { pos: symbol?.from ?? pos, create: (view) => popup(view, value) },
      };
      view.dispatch({ effects: showUsages.of(value) });
    } catch (error) {
      if (view.state.doc === doc) {
        view.dispatch({
          effects: showMessage.of({ pos, text: (error as { message?: string }).message ?? String(error) }),
        });
      }
    }
  });
  return true;
}

/**
 * Returns the line holding a usage from `from` to `to`, highlighted as in `state`, with its indentation trimmed and
 * the usage marked.
 */
function preview(
  state: EditorState | undefined,
  line: { from: number; text: string },
  from: number,
  to: number,
): HTMLElement {
  const dom = document.createElement('span');
  dom.className = 'cm-lsp-reference-preview';

  // Keeps what is before the usage short, so the usage stays in view.
  const start = line.from + Math.max(line.text.length - line.text.trimStart().length, from - line.from - 50);
  const end = line.from + line.text.length;
  const classes: string[] = new Array(end - start).fill('');
  if (state) {
    highlightTree(
      syntaxTree(state),
      { style: (tags) => highlightingFor(state, tags) },
      (styleFrom, styleTo, style) => {
        for (let pos = Math.max(styleFrom, start); pos < Math.min(styleTo, end); pos++) {
          classes[pos - start] = style;
        }
      },
      start,
      end,
    );
  }

  // Groups the line into runs of the same classes, marking the usage.
  let parent: HTMLElement = dom;
  let run: HTMLElement | null = null;
  for (let pos = start; pos < end; pos++) {
    if (pos === from) {
      parent = dom.appendChild(document.createElement('mark'));
      parent.className = 'cm-lsp-reference-match';
      run = null;
    } else if (pos === to) {
      parent = dom;
      run = null;
    }

    const style = classes[pos - start];
    if (run === null || run.className !== style) {
      run = parent.appendChild(document.createElement('span'));
      run.className = style;
    }
    run.textContent += line.text[pos - line.from];
  }
  return dom;
}

/**
 * Moves the selection to `next(selected)`, skipping usages that can't be opened. `wrap` wraps around the ends, and
 * otherwise stops at them.
 */
function move(view: EditorView, next: (selected: number) => number, wrap: boolean): boolean {
  const value = view.state.field(usages, false);
  if (!value) {
    return false;
  }

  const openable = value.usages.flatMap((usage, i) => (usage.range === null ? [] : [i]));
  if (openable.length > 0) {
    const index = next(openable.indexOf(value.selected));
    const selected = wrap
      ? openable[((index % openable.length) + openable.length) % openable.length]
      : openable[Math.min(Math.max(index, 0), openable.length - 1)];
    view.dispatch({ effects: selectUsage.of(selected) });
  }
  return true;
}

/**
 * Closes the popup, and moves the cursor to `usage`, in its own editor. The usage is scrolled to the middle of the
 * editor unless it is visible already, as search does.
 */
function open(view: EditorView, usage: Usage | undefined): void {
  const plugin = LSPPlugin.get(view);
  const range = usage?.range;
  if (!plugin || !usage || !range) {
    return;
  }

  view.dispatch({ effects: closeUsages.of(null) });
  Promise.resolve(usage.uri === plugin.uri ? view : plugin.client.workspace.displayFile(usage.uri)).then((target) => {
    if (!target) {
      return;
    }

    target.dispatch({
      selection: { anchor: range.from },
      effects: scroll(EditorSelection.range(range.from, range.to), target),
      userEvent: 'select.reference',
    });
    target.focus();
  });
}

function popup(view: EditorView, value: Usages) {
  const dom = document.createElement('div');
  dom.className = 'cm-lsp-references';

  const header = dom.appendChild(document.createElement('div'));
  header.className = 'cm-lsp-references-header';
  const count = value.usages.length === 1 ? '1 usage' : `${value.usages.length} usages`;
  const title = document.createElement('span');
  title.append('Usages of ', Object.assign(document.createElement('code'), { textContent: value.name }));
  header.append(
    title,
    Object.assign(document.createElement('span'), { className: 'cm-lsp-references-count', textContent: count }),
  );

  const list = dom.appendChild(document.createElement('ul'));
  list.className = 'cm-lsp-references-list';
  list.role = 'listbox';
  list.ariaLabel = 'Usages';
  const icons = new Map<string, string>();
  const options = value.usages.map((usage) => {
    const option = list.appendChild(document.createElement('li'));
    option.className = usage.range === null ? 'cm-lsp-reference cm-lsp-reference-elsewhere' : 'cm-lsp-reference';
    option.role = 'option';
    option.ariaDisabled = usage.range === null ? 'true' : null;

    let icon = icons.get(usage.file);
    if (icon === undefined) {
      icon = renderToStaticMarkup(createElement(FileIcon, { name: usage.file }));
      icons.set(usage.file, icon);
    }
    option.insertAdjacentHTML('beforeend', icon);
    option.append(
      usage.preview ?? Object.assign(document.createElement('span'), { className: 'cm-lsp-reference-preview' }),
    );

    const location = option.appendChild(document.createElement('span'));
    location.className = 'cm-lsp-reference-location';
    location.append(
      usage.file,
      Object.assign(document.createElement('span'), {
        className: 'cm-lsp-reference-line',
        textContent: String(usage.line),
      }),
    );
    return option;
  });

  dom.append(
    hint('cm-lsp-references-hint', [
      ['Enter', 'open'],
      ['Escape', 'close'],
    ]),
  );

  // Keeps the focus in the editor, as completion does.
  dom.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const index = options.findIndex((option) => option.contains(event.target as Node));
    open(view, view.state.field(usages, false)?.usages[index]);
  });

  let selected = -1;
  const select = () => {
    const current = view.state.field(usages, false);
    if (!current || current.selected === selected) {
      return;
    }

    options[selected]?.removeAttribute('aria-selected');
    selected = current.selected;
    const option = options[selected];
    if (!option) {
      return;
    }

    option.ariaSelected = 'true';
    if (option.offsetTop < list.scrollTop) {
      list.scrollTop = option.offsetTop - list.clientTop - 4;
    } else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight + 4;
    }
  };

  return { dom, mount: select, update: select };
}
