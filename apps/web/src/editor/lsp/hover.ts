import { LSPPlugin } from '@codemirror/lsp-client';
import { CharCategory, type Extension, StateEffect, StateField } from '@codemirror/state';
import {
  closeHoverTooltips,
  type EditorView,
  hasHoverTooltips,
  hoverTooltip,
  keymap,
  showTooltip,
  type Tooltip,
} from '@codemirror/view';
import { formatKey } from '@elsewise/components/lib/platform';
import { DEFAULT_COMMANDS, DEFAULT_KEYS, type EditorCommand } from '@elsewise/plugin';
import {
  DiagnosticSeverity,
  type Hover,
  type HoverParams,
  type Diagnostic as LSPDiagnostic,
} from 'vscode-languageserver-protocol';
import { COMMANDS } from '@/editor/editor-manager';
import { APPLY_TOP_FIX, apply, isFix, requestActions, SHOW_CONTEXT_ACTIONS } from '@/editor/lsp/actions';
import { problems, SEVERITIES } from '@/editor/lsp/diagnostics';
import { documentation } from '@/editor/lsp/documentation';
import { highlightClick } from '@/editor/lsp/highlights';
import { appendCode } from '@/editor/tooltip';

/**
 * The milliseconds to wait for the server's fixes before showing a problem without them.
 */
const FIXES_DELAY = 300;

// The hover that `SHOW_HOVER` opened at the cursor, until the cursor moves.
const cursorHover = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCursorHover)) {
        return effect.value;
      }
      if (effect === closeHoverTooltips) {
        return null;
      }
    }
    return tr.docChanged || tr.selection ? null : value;
  },
  provide: (field) => showTooltip.from(field),
});

const setCursorHover = StateEffect.define<Tooltip | null>();

export const SHOW_HOVER: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.lsp.showHover,
  label: 'Quick documentation',
  defaultKeys: DEFAULT_KEYS.editor.lsp.showHover,
  enabled: (_, _view, lsp) => lsp !== null,
  shown: (_, _view, lsp) => lsp !== null,
  // Shows the hover for the word the cursor is in, or else the one it ends, until the cursor moves.
  run(_, view, lsp) {
    if (lsp === null) {
      return false;
    }

    const { state } = view;
    const pos = state.selection.main.head;
    const side = state.charCategorizer(pos)(state.sliceDoc(pos, pos + 1)) === CharCategory.Word ? 1 : -1;
    void lookUp(view, pos, side).then((tooltips) => {
      if (tooltips === null || view.state.doc !== state.doc || !view.state.selection.eq(state.selection)) {
        return;
      }

      // Based on `@codemirror/view`'s `HoverTooltipHost`, so that it looks like the hover under the pointer.
      view.dispatch({
        effects: setCursorHover.of({
          pos: Math.min(...tooltips.map((tooltip) => tooltip.pos)),
          end: Math.max(...tooltips.map((tooltip) => tooltip.end ?? tooltip.pos)),
          above: true,
          create: (view) => {
            const dom = Object.assign(document.createElement('div'), { className: 'cm-tooltip-hover' });
            for (const tooltip of tooltips) {
              dom.appendChild(tooltip.create(view).dom).classList.add('cm-tooltip-section');
            }
            return { dom };
          },
        }),
      });
    });
    return true;
  },
};

/**
 * Returns the extension that shows the problems and the server's documentation for the code under the pointer, or
 * under the cursor on {@link SHOW_HOVER}.
 */
export function serverHover(): Extension {
  return [
    hoverTooltip(lookUp, { hideOn: (tr) => tr.docChanged }),
    cursorHover,
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (!hasHoverTooltips(view.state) && !view.state.field(cursorHover)) {
            return false;
          }
          view.dispatch({ effects: closeHoverTooltips });
          return true;
        },
      },
    ]),
  ];
}

/**
 * Returns the problems and the server's documentation at `pos`, on `side` of it, or null if there are none.
 *
 * Waits for the documentation and the problems' fixes before returning any of them, so the hover doesn't shift as they
 * arrive.
 */
async function lookUp(view: EditorView, pos: number, side: -1 | 1): Promise<Tooltip[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin || view.state.field(highlightClick, false)) {
    return null;
  }

  plugin.client.sync();
  const found = (view.state.field(problems, false) ?? []).filter(
    ({ from, to }) => pos >= from && pos <= to && (from === to || ((pos > from || side > 0) && (pos < to || side < 0))),
  );

  const [result, answers] = await Promise.all([
    plugin.client.serverCapabilities?.hoverProvider
      ? plugin.client
          .request<HoverParams, Hover | null>('textDocument/hover', {
            position: plugin.toPosition(pos),
            textDocument: { uri: plugin.uri },
          })
          .catch(() => null)
      : null,
    Promise.all(
      found.map(({ item }) =>
        Promise.race([
          requestActions(view, item.range, [item]).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FIXES_DELAY)),
        ]),
      ),
    ),
  ]);

  const tooltips: Tooltip[] = [];
  // Based on `@codemirror/lint`'s `lintTooltip`.
  //
  // Adds a line for each problem's fixes.
  if (found.length > 0) {
    const dom = document.createElement('ul');
    dom.className = 'cm-tooltip-lint';
    for (const [i, { item }] of found.entries()) {
      const problem = dom.appendChild(document.createElement('li'));
      problem.className = `cm-diagnostic cm-diagnostic-${SEVERITIES[item.severity ?? DiagnosticSeverity.Error]}`;
      const text = problem.appendChild(document.createElement('span'));
      text.className = 'cm-diagnosticText';
      text.append(render(plugin, item));

      const answer = answers[i];
      if (!answer || answer.actions.length === 0) {
        continue;
      }

      const { actions, doc } = answer;
      const line = text.appendChild(document.createElement('div'));
      line.className = 'cm-lsp-actions-hover';
      const button = (label: string, run: () => void) => {
        const dom = Object.assign(document.createElement('button'), { type: 'button' });
        appendCode(dom, label);
        dom.addEventListener('click', run);
        return dom;
      };

      // Returns the command's first key, after a space, or nothing if it has none.
      const commands = view.state.facet(COMMANDS);
      const key = (id: string) => {
        const binding = commands?.keymap.commands.get(id)?.[0];
        return binding === undefined
          ? []
          : [' ', Object.assign(document.createElement('kbd'), { textContent: formatKey(binding) })];
      };

      const fix = actions.find(isFix);
      if (fix) {
        line.append(
          button(fix.title, () => void apply(view, fix, doc)),
          ...key(APPLY_TOP_FIX.id),
          ' · ',
        );
      }
      // Opens the actions at the problem rather than wherever the cursor is.
      line.append(
        button('More actions', () => {
          const current = view.state.field(problems, false)?.find((entry) => entry.item === item);
          if (current) {
            view.dispatch({ selection: { anchor: current.from } });
          }
          view.focus();
          commands?.run(SHOW_CONTEXT_ACTIONS.id, view);
        }),
        ...key(SHOW_CONTEXT_ACTIONS.id),
      );
    }

    tooltips.push({
      pos: Math.min(...found.map(({ from }) => from)),
      end: Math.max(...found.map(({ to }) => to)),
      above: true,
      create: () => ({ dom }),
    });
  }

  // Copied from `@codemirror/lsp-client`'s `lspTooltipSource`.
  //
  // Shows the code blocks that open the documentation as a highlighted definition above the rest.
  if (result != null) {
    const { contents } = result;
    const dom = documentation(
      plugin,
      typeof contents === 'object' && 'kind' in contents
        ? contents
        : {
            kind: 'markdown',
            value: (Array.isArray(contents) ? contents : [contents])
              .map((part) => (typeof part === 'string' ? part : `\`\`\`${part.language}\n${part.value}\n\`\`\``))
              .join('\n\n'),
          },
    );
    if (dom !== null) {
      dom.className = 'cm-lsp-hover-tooltip';
      tooltips.push({
        pos: result.range ? plugin.fromPosition(result.range.start) : pos,
        end: result.range ? plugin.fromPosition(result.range.end) : pos,
        above: true,
        create: () => ({ dom }),
      });
    }
  }

  return tooltips.length > 0 ? tooltips : null;
}

/**
 * Returns the server's message for `item`, with its source and code.
 */
function render(plugin: LSPPlugin, item: LSPDiagnostic): DocumentFragment {
  const result = document.createDocumentFragment();
  const message = result.appendChild(document.createElement('div'));
  message.className = 'cm-diagnosticMessage';
  if (typeof item.message === 'string') {
    // Plain messages still quote code in backticks, e.g. "cannot find value `x` in this scope".
    appendCode(message, item.message);
  } else {
    message.innerHTML = plugin.docToHTML(item.message);
  }

  if (item.source !== undefined || item.code !== undefined) {
    const meta = result.appendChild(document.createElement('div'));
    meta.className = 'cm-diagnosticMeta';
    if (item.source !== undefined) {
      meta.append(item.source);
    }
    if (item.code !== undefined) {
      if (item.source !== undefined) {
        meta.append(' · ');
      }
      // Links only to the web, since the server can send any URI.
      const href = item.codeDescription?.href;
      const code = meta.appendChild(
        href !== undefined && /^https?:/i.test(href)
          ? Object.assign(document.createElement('a'), { href })
          : document.createElement('span'),
      );
      code.textContent = String(item.code);
    }
  }
  return result;
}
