import { forEachDiagnostic } from '@codemirror/lint';
import { type Extension, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import {
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  type EditorAction,
  type EditorActionSource,
  type EditorCommand,
  type EditorDiagnostic,
} from '@elsewise/plugin';
import { appendCode, hint } from '@/editor/tooltip';

// A bulb, and the exclamation mark cut out of it for a fix.
const BULB =
  'M8 1.75a4.25 4.25 0 0 0-2.5 7.69c.36.26.5.6.5 1.03V11.5h4v-1.03c0-.43.14-.77.5-1.03A4.25 4.25 0 0 0 8 1.75Z' +
  'M6 12.5h4v1a.75.75 0 0 1-.75.75h-2.5A.75.75 0 0 1 6 13.5Z';
const MARK = 'M7.35 4.55a.65.65 0 0 1 1.3 0v2.3a.65.65 0 0 1-1.3 0ZM8 8.45a.75.75 0 1 1 0 1.5a.75.75 0 1 1 0-1.5Z';

/**
 * The actions shown in the popup.
 */
interface Actions {
  actions: readonly EditorAction[];
  /**
   * The index of the selected action.
   */
  selected: number;
  tooltip: Tooltip;
}

const popup = StateField.define<Actions | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showActions)) {
        return effect.value;
      } else if (effect.is(closeActions)) {
        return null;
      } else if (value && effect.is(selectAction)) {
        value = { ...value, selected: effect.value };
      }
    }
    return tr.docChanged || tr.selection ? null : value;
  },
  provide: (field) => [
    showTooltip.from(field, (value) => value?.tooltip ?? null),
    EditorView.focusChangeEffect.of((state, focusing) =>
      !focusing && state.field(field, false) ? closeActions.of(null) : null,
    ),
  ],
});

const showActions = StateEffect.define<Actions>();
const selectAction = StateEffect.define<number>();
const closeActions = StateEffect.define<null>();

// Says there are no actions at a position, until the cursor moves or the document changes.
const message = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showMessage)) {
        return effect.value === null
          ? null
          : {
              pos: effect.value,
              above: true,
              create: () => ({
                dom: Object.assign(document.createElement('div'), {
                  className: 'cm-actions-message',
                  textContent: 'No context actions available',
                }),
              }),
            };
      }
    }
    return tr.docChanged || tr.selection ? null : value;
  },
  provide: (field) => showTooltip.from(field),
});

const showMessage = StateEffect.define<number | null>();

export const APPLY_TOP_FIX: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.actions.applyTopFix,
  label: 'Apply top fix',
  defaultKeys: DEFAULT_KEYS.editor.actions.applyTopFix,
  enabled: (_, view) => !view.state.readOnly,
  // Applies the preferred fix, or else the first.
  run(_, view) {
    const { doc } = view.state;
    void actionsAt(view, ...diagnosticsAt(view)).then((found) => {
      const fix = found.find((action) => action.type !== undefined);
      if (fix && view.state.doc === doc) {
        void apply(view, fix);
      }
    });
    return true;
  },
};

export const SHOW_ACTIONS: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.actions.show,
  label: 'Show context actions',
  defaultKeys: DEFAULT_KEYS.editor.actions.show,
  enabled: (_, view) => !view.state.readOnly,
  run(_, view) {
    const pos = view.state.selection.main.head;
    const { doc } = view.state;
    void actionsAt(view, ...diagnosticsAt(view)).then((found) => {
      if (view.state.doc !== doc) {
        return;
      }
      if (found.length === 0) {
        view.dispatch({ effects: showMessage.of(pos) });
        return;
      }

      const value: Actions = { actions: found, selected: 0, tooltip: { pos, create: (view) => list(view, value) } };
      view.dispatch({ effects: [showActions.of(value), showMessage.of(null)] });
    });
    return true;
  },
};

/**
 * Returns the extension that shows the `actions` language data's actions on {@link SHOW_ACTIONS}, and applies the top
 * fix on {@link APPLY_TOP_FIX}.
 */
export function actions(): Extension {
  return [
    popup,
    message,
    Prec.high(
      keymap.of([
        { key: 'ArrowDown', run: (view) => move(view, 1) },
        { key: 'ArrowUp', run: (view) => move(view, -1) },
        {
          key: 'Enter',
          run: (view) => {
            const value = view.state.field(popup, false);
            if (!value) {
              return false;
            }
            void apply(view, value.actions[value.selected]);
            return true;
          },
        },
        {
          key: 'Escape',
          run: (view) => {
            if (view.state.field(popup, false)) {
              view.dispatch({ effects: closeActions.of(null) });
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
  ];
}

/**
 * Returns the actions for `from` to `to`.
 */
export async function actionsAt(
  view: EditorView,
  from: number,
  to: number,
  diagnostics: readonly EditorDiagnostic[],
  wait?: number,
): Promise<EditorAction[]> {
  const actions = diagnostics.flatMap((diagnostic) =>
    (diagnostic.actions ?? []).map(
      (action): EditorAction => ({
        label: action.name,
        type: action.type,
        apply: (view) => action.apply(view, diagnostic.from, diagnostic.to),
      }),
    ),
  );
  const sources = view.state
    .languageDataAt<EditorActionSource>('actions', from)
    .toSorted((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || 0);

  const results = await Promise.allSettled(
    sources.map((source) => {
      const found = Promise.try(() => source.actions(view, from, to, diagnostics));
      return wait === undefined
        ? found
        : Promise.race([found, new Promise<readonly EditorAction[]>((resolve) => setTimeout(() => resolve([]), wait))]);
    }),
  );
  const found = [...actions, ...results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))];

  const rank = (action: EditorAction) => (action.type === 'preferredFix' ? 0 : action.type === 'fix' ? 1 : 2);
  return found.toSorted((a, b) => rank(a) - rank(b));
}

/**
 * Returns the selection and the diagnostics in it.
 *
 * If the selection has no diagnostics, returns the range of the first diagnostic on the cursor's line and the
 * diagnostics on that line.
 */
function diagnosticsAt(view: EditorView): [from: number, to: number, diagnostics: EditorDiagnostic[]] {
  const { state } = view;
  const { from, to } = state.selection.main;
  const line = state.doc.lineAt(state.selection.main.head);
  const found: EditorDiagnostic[] = [];
  forEachDiagnostic(state, (diagnostic, from, to) => {
    found.push({ ...diagnostic, from, to });
  });
  const overlapping = found.filter((diagnostic) => diagnostic.from <= to && diagnostic.to >= from);
  const near = found.filter((diagnostic) => diagnostic.from <= line.to && diagnostic.to >= line.from);

  const [first] = near;
  return overlapping.length === 0 && first ? [first.from, first.to, near] : [from, to, overlapping];
}

/**
 * Closes the popup and applies `action`, saying so if it fails.
 */
export async function apply(view: EditorView, action: EditorAction): Promise<void> {
  if (view.state.field(popup, false)) {
    view.dispatch({ effects: closeActions.of(null) });
  }
  try {
    await action.apply(view);
  } catch (error) {
    toast.add({
      type: 'error',
      title: 'Applying action failed',
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

function move(view: EditorView, by: number): boolean {
  const value = view.state.field(popup, false);
  if (!value) {
    return false;
  }

  const count = value.actions.length;
  view.dispatch({ effects: selectAction.of((((value.selected + by) % count) + count) % count) });
  return true;
}

function list(view: EditorView, value: Actions) {
  const dom = document.createElement('div');
  dom.className = 'cm-actions';

  const listbox = dom.appendChild(document.createElement('ul'));
  listbox.className = 'cm-actions-list';
  listbox.role = 'listbox';
  listbox.ariaLabel = 'Actions';
  const options = value.actions.map((action, i) => {
    // Divides the fixes from the rest.
    if (i > 0 && value.actions[i - 1].type !== undefined && action.type === undefined) {
      listbox.appendChild(
        Object.assign(document.createElement('li'), { className: 'cm-actions-divider', role: 'separator' }),
      );
    }

    const option = listbox.appendChild(document.createElement('li'));
    option.className = action.type === undefined ? 'cm-action' : 'cm-action cm-action-fix';
    option.role = 'option';
    // Pads the bulb, which would otherwise look larger than the letters in the completion list's icons.
    option.innerHTML = `<svg class="cm-action-bulb" viewBox="-1 -1 18 18" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${action.type === undefined ? BULB : BULB + MARK}"/></svg>`;
    appendCode(option.appendChild(document.createElement('span')), action.label);
    return option;
  });

  dom.append(
    hint('cm-actions-hint', [
      ['Enter', 'apply'],
      ['Escape', 'close'],
    ]),
  );

  // Keeps the focus in the editor, as completion does.
  dom.addEventListener('mousedown', (event) => event.preventDefault());
  listbox.addEventListener('click', (event) => {
    const index = options.findIndex((option) => option.contains(event.target as Node));
    if (index >= 0) {
      void apply(view, value.actions[index]);
    }
  });

  let selected = -1;
  const select = () => {
    const current = view.state.field(popup, false);
    if (!current || current.selected === selected) {
      return;
    }

    options[selected]?.removeAttribute('aria-selected');
    selected = current.selected;
    options[selected]?.setAttribute('aria-selected', 'true');
  };

  return { dom, mount: select, update: select };
}
