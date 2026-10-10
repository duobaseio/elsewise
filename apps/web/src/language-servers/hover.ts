import { LSPPlugin } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { closeHoverTooltips, hasHoverTooltips, hoverTooltip, keymap, type Tooltip } from '@codemirror/view';
import { shortcut } from '@elsewise/components/lib/os';
import {
  DiagnosticSeverity,
  type Hover,
  type HoverParams,
  type Diagnostic as LSPDiagnostic,
} from 'vscode-languageserver-protocol';
import { appendCode } from '@/components/code-editor/tooltip';
import { APPLY_TOP_FIX, apply, isFix, requestActions, SHOW_ACTIONS, showActions } from '@/language-servers/actions';
import { problems, SEVERITIES } from '@/language-servers/diagnostics';
import { documentation } from '@/language-servers/documentation';
import { highlightClick } from '@/language-servers/highlights';

/**
 * The milliseconds to wait for the server's fixes before showing a problem without them.
 */
const FIXES_DELAY = 300;

/**
 * Returns the extension that shows the problems and the server's documentation for the code under the pointer.
 */
export function serverHover(): Extension {
  return [
    hoverTooltip(
      // Waits for the documentation and the problems' fixes before showing any of them, so the hover doesn't shift as
      // they arrive.
      async (view, pos, side): Promise<Tooltip[] | null> => {
        const plugin = LSPPlugin.get(view);
        if (!plugin || view.state.field(highlightClick, false)) {
          return null;
        }

        plugin.client.sync();
        const found = (view.state.field(problems, false) ?? []).filter(
          ({ from, to }) =>
            pos >= from && pos <= to && (from === to || ((pos > from || side > 0) && (pos < to || side < 0))),
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
            const key = (binding: string) =>
              Object.assign(document.createElement('kbd'), { textContent: shortcut(binding) });

            const fix = actions.find(isFix);
            if (fix) {
              line.append(
                button(fix.title, () => void apply(view, fix, doc)),
                ' ',
                key(APPLY_TOP_FIX),
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
                showActions(view);
              }),
              ' ',
              key(SHOW_ACTIONS),
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
      },
      { hideOn: (tr) => tr.docChanged },
    ),
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (!hasHoverTooltips(view.state)) {
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
