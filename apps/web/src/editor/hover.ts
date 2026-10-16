import { type Action, type Diagnostic, forEachDiagnostic, linter } from '@codemirror/lint';
import { CharCategory, type Extension, Facet, StateEffect, StateField } from '@codemirror/state';
import {
  closeHoverTooltips,
  EditorView,
  type HoverTooltipSource,
  hasHoverTooltips,
  hoverTooltip,
  keymap,
  showTooltip,
  type Tooltip,
} from '@codemirror/view';
import { formatKey } from '@elsewise/components/lib/platform';
import {
  DEFAULT_COMMANDS,
  DEFAULT_HOVER_SECTIONS,
  DEFAULT_KEYS,
  type EditorCommand,
  type EditorDiagnostic,
} from '@elsewise/plugin';
import { COMMANDS } from '@/editor/editor-manager';
import { appendCode } from '@/editor/tooltip';

/**
 * The milliseconds to wait for a source's actions before showing a problem without them.
 */
const FIXES_DELAY = 300;

/**
 * An action on a problem, with the command whose key the hover hints after it.
 */
export type ProblemAction = Action & { command?: string };

// TODO: Replace with the editor-level action sources, which let plugins add actions in an order shared with the context
// actions popup.
/**
 * The sources of each problem's actions in the hover, after the problem's own, in order.
 */
export const problemActionSources =
  Facet.define<(view: EditorView, diagnostic: EditorDiagnostic) => Promise<ProblemAction[]>>();

/**
 * The sources of the hover's sections, shown lowest `order` first, then those without an order, each in the order
 * added when equal. The problems are at {@link DEFAULT_HOVER_SECTIONS.problems}.
 */
export const hoverSources = Facet.define<{ source: HoverTooltipSource; order?: number }>();

/**
 * Whether a click in the code closes the hovers, and keeps them closed until the mouse moves away, false unless set.
 */
export const closeHoverOnClick = Facet.define<boolean, boolean>({ combine: (values) => values.some(Boolean) });

// Where the mouse was pressed in the code to close the hovers, or `null` once it has moved. Hovers stay closed while
// it's set.
const click = StateField.define<{ x: number; y: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setClick)) {
        value = effect.value;
      }
    }
    return value;
  },
});

const setClick = StateEffect.define<{ x: number; y: number } | null>();

const clicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (view.state.facet(closeHoverOnClick) && view.contentDOM.contains(event.target as Node)) {
      view.dispatch({ effects: [setClick.of({ x: event.clientX, y: event.clientY }), closeHoverTooltips] });
    }
    return false;
  },
  mousemove(event, view) {
    const value = view.state.field(click);
    // Ignores dragging a selection, and the move to the same spot that can follow a click.
    if (value && event.buttons === 0 && (event.clientX !== value.x || event.clientY !== value.y)) {
      view.dispatch({ effects: setClick.of(null) });
    }
    return false;
  },
});

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
  id: DEFAULT_COMMANDS.editor.hover.show,
  label: 'Quick documentation',
  defaultKeys: DEFAULT_KEYS.editor.hover.show,
  // Shows the hover for the word the cursor is on, until the cursor moves.
  run(_, view) {
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
 * Returns the extension that shows the problems and the {@link hoverSources}' sections for the code under the pointer,
 * or under the cursor on {@link SHOW_HOVER}.
 */
export function hover(): Extension {
  return [
    hoverTooltip(lookUp, { hideOn: (tr) => tr.docChanged }),
    cursorHover,
    click,
    clicks,
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
    // Leaves the problems to the hover, which shows them with their fixes. Returns `null`, since the linter shows `[]`
    // as an empty tooltip.
    linter(null, { tooltipFilter: () => null as unknown as Diagnostic[] }),
  ];
}

/**
 * Returns the problems and the sources' sections at `pos`, on `side` of it, or null if there are none.
 *
 * Waits for the sections and the problems' actions before returning any of them, so the hover doesn't shift as they
 * arrive.
 */
async function lookUp(view: EditorView, pos: number, side: -1 | 1): Promise<Tooltip[] | null> {
  if (view.state.field(click)) {
    return null;
  }

  const found: { diagnostic: EditorDiagnostic; from: number; to: number }[] = [];
  // Includes the problems that only touch `pos`, whichever `side` the pointer is on, as servers' documentation does.
  forEachDiagnostic(view.state, (diagnostic, from, to) => {
    if (pos >= from && pos <= to) {
      found.push({ diagnostic, from, to });
    }
  });

  const sources = view.state.facet(hoverSources);
  const [fixes, tooltips] = await Promise.all([
    Promise.all(
      found.map(async ({ diagnostic }) =>
        (
          await Promise.all(
            view.state
              .facet(problemActionSources)
              .map((source) =>
                Promise.race([
                  source(view, diagnostic).catch(() => []),
                  new Promise<ProblemAction[]>((resolve) => setTimeout(() => resolve([]), FIXES_DELAY)),
                ]),
              ),
          )
        ).flat(),
      ),
    ),
    Promise.all(sources.map(({ source }) => Promise.try(source, view, pos, side).catch(() => null))),
  ]);

  const sections: { order: number; tooltips: readonly Tooltip[] }[] = [];
  // Based on `@codemirror/lint`'s `lintTooltip`.
  //
  // Adds each problem's code, and a line for its actions and the server's fixes.
  if (found.length > 0) {
    const locate = (diagnostic: Diagnostic) => {
      let range: { from: number; to: number } | undefined;
      forEachDiagnostic(view.state, (current, from, to) => {
        if (current === diagnostic) {
          range ??= { from, to };
        }
      });
      return range;
    };

    // Returns the command's first key, after a space, or nothing if it has none.
    const commands = view.state.facet(COMMANDS);
    const key = (id: string | undefined) => {
      const binding = id === undefined ? undefined : commands?.keymap.commands.get(id)?.[0];
      return binding === undefined
        ? []
        : [' ', Object.assign(document.createElement('kbd'), { textContent: formatKey(binding) })];
    };

    const dom = document.createElement('ul');
    dom.className = 'cm-tooltip-lint';
    for (const [i, { diagnostic }] of found.entries()) {
      // Message.
      const problem = dom.appendChild(document.createElement('li'));
      problem.className = `cm-diagnostic cm-diagnostic-${diagnostic.severity}`;
      const text = problem.appendChild(document.createElement('span'));
      text.className = 'cm-diagnosticText';

      const message = text.appendChild(document.createElement('div'));
      message.className = 'cm-diagnosticMessage';
      if (diagnostic.renderMessage) {
        message.append(diagnostic.renderMessage(view));
      } else {
        // Plain messages still quote code in backticks, e.g. "cannot find value `x` in this scope".
        appendCode(message, diagnostic.message);
      }

      // Source of problem/meta information.
      const { source, code, codeHref } = diagnostic;
      if (source !== undefined || code !== undefined) {
        const meta = text.appendChild(document.createElement('div'));
        meta.className = 'cm-diagnosticMeta';
        if (source !== undefined) {
          meta.append(source);
        }
        if (code !== undefined) {
          if (source !== undefined) {
            meta.append(' · ');
          }
          // Links only to the web, since a server or plugin can give any URI.
          meta.appendChild(
            codeHref !== undefined && /^https?:/i.test(codeHref)
              ? Object.assign(document.createElement('a'), { href: codeHref })
              : document.createElement('span'),
          ).textContent = String(code);
        }
      }

      // Fixes
      const actions: ProblemAction[] = [...(diagnostic.actions ?? []), ...fixes[i]];
      if (actions.length > 0) {
        const line = text.appendChild(document.createElement('div'));
        line.className = 'cm-lsp-actions-hover';
        for (const [j, action] of actions.entries()) {
          const button = Object.assign(document.createElement('button'), { type: 'button' });
          appendCode(button, action.name);
          button.addEventListener('click', () => {
            const range = locate(diagnostic);
            if (range) {
              action.apply(view, range.from, range.to);
            }
          });
          line.append(j === 0 ? '' : ' · ', button, ...key(action.command));
        }
      }
    }

    sections.push({
      order: DEFAULT_HOVER_SECTIONS.problems,
      tooltips: [
        {
          pos: Math.min(...found.map(({ from }) => from)),
          end: Math.max(...found.map(({ to }) => to)),
          above: true,
          create: () => ({ dom }),
        },
      ],
    });
  }

  for (const [i, { order = Number.POSITIVE_INFINITY }] of sources.entries()) {
    const result = tooltips[i];
    if (result) {
      sections.push({ order, tooltips: [result].flat() });
    }
  }

  const shown = sections.toSorted((a, b) => a.order - b.order || 0).flatMap((section) => section.tooltips);
  return shown.length > 0 ? shown : null;
}
