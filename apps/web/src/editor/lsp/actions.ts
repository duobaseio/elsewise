import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { Prec, StateEffect, StateField, type Text } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { DEFAULT_COMMANDS, type EditorCommand } from '@elsewise/plugin';
import {
  type CodeAction,
  type CodeActionParams,
  CodeActionTriggerKind,
  type Command,
  type Diagnostic,
  type ExecuteCommandParams,
  type Range,
} from 'vscode-languageserver-protocol';
import { problems } from '@/editor/lsp/diagnostics';
import { applyWorkspaceEdit } from '@/editor/lsp/edits';
import { appendCode, hint } from '@/editor/tooltip';

// A bulb, and the exclamation mark cut out of it for a quick fix.
const BULB =
  'M8 1.75a4.25 4.25 0 0 0-2.5 7.69c.36.26.5.6.5 1.03V11.5h4v-1.03c0-.43.14-.77.5-1.03A4.25 4.25 0 0 0 8 1.75Z' +
  'M6 12.5h4v1a.75.75 0 0 1-.75.75h-2.5A.75.75 0 0 1 6 13.5Z';
const MARK = 'M7.35 4.55a.65.65 0 0 1 1.3 0v2.3a.65.65 0 0 1-1.3 0ZM8 8.45a.75.75 0 1 1 0 1.5a.75.75 0 1 1 0-1.5Z';

/**
 * The code actions shown in the popup.
 */
interface Actions {
  actions: readonly CodeAction[];
  /**
   * The index of the selected action.
   */
  selected: number;
  tooltip: Tooltip;
}

const actions = StateField.define<Actions | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showActionsEffect)) {
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

const showActionsEffect = StateEffect.define<Actions>();
const selectAction = StateEffect.define<number>();
const closeActions = StateEffect.define<null>();

// Says why no actions are shown, until the cursor moves or the document changes.
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
              className: 'cm-lsp-actions-message',
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

export const APPLY_TOP_FIX: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.lsp.applyTopFix,
  label: 'Apply top fix',
  defaultKeys: ['Shift-Alt-Enter'],
  enabled: (_, view, lsp) => !view.state.readOnly && Boolean(lsp?.client.serverCapabilities?.codeActionProvider),
  shown: (_, _view, lsp) => Boolean(lsp?.client.serverCapabilities?.codeActionProvider),
  // Applies the quick fix the server prefers, or else the first.
  run(_, view, lsp) {
    if (lsp === null) {
      return;
    }

    const pos = view.state.selection.main.head;
    const doc = view.state.doc;
    void requestActions(view, ...at(view, lsp)).then(
      ({ actions: found }) => {
        const fix = found.find(isFix);
        if (fix) {
          void apply(view, fix, doc);
        }
      },
      (error) => {
        if (view.state.doc === doc) {
          view.dispatch({
            effects: showMessage.of({ pos, text: (error as { message?: string }).message ?? String(error) }),
          });
        }
      },
    );
  },
};

export const SHOW_CONTEXT_ACTIONS: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.lsp.showContextActions,
  label: 'Show context actions',
  defaultKeys: ['Alt-Enter'],
  enabled: (_, view, lsp) => !view.state.readOnly && Boolean(lsp?.client.serverCapabilities?.codeActionProvider),
  shown: (_, _view, lsp) => Boolean(lsp?.client.serverCapabilities?.codeActionProvider),
  run(_, view, lsp) {
    if (lsp === null) {
      return;
    }

    const pos = view.state.selection.main.head;
    const doc = view.state.doc;
    void requestActions(view, ...at(view, lsp)).then(
      ({ actions: found }) => {
        if (view.state.doc !== doc) {
          return;
        }
        if (found.length === 0) {
          view.dispatch({ effects: showMessage.of({ pos, text: 'No context actions available' }) });
          return;
        }

        const value: Actions = {
          actions: found,
          selected: 0,
          tooltip: { pos, create: (view) => popup(view, value) },
        };
        view.dispatch({ effects: [showActionsEffect.of(value), showMessage.of(null)] });
      },
      (error) => {
        if (view.state.doc === doc) {
          view.dispatch({
            effects: showMessage.of({ pos, text: (error as { message?: string }).message ?? String(error) }),
          });
        }
      },
    );
  },
};

/**
 * Returns the extension that shows and applies the server's code actions.
 */
export function serverActions(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        codeAction: {
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: [
                'quickfix',
                'refactor',
                'refactor.extract',
                'refactor.inline',
                'refactor.rewrite',
                'source',
                'source.organizeImports',
                'source.fixAll',
              ],
            },
          },
          isPreferredSupport: true,
          dataSupport: true,
          resolveSupport: { properties: ['edit'] },
        },
      },
    },
    editorExtension: [
      actions,
      message,
      Prec.high(
        keymap.of([
          { key: 'ArrowDown', run: (view) => move(view, 1) },
          { key: 'ArrowUp', run: (view) => move(view, -1) },
          {
            key: 'Enter',
            run: (view) => {
              const value = view.state.field(actions, false);
              if (!value) {
                return false;
              }
              void apply(view, value.actions[value.selected], view.state.doc);
              return true;
            },
          },
          {
            key: 'Escape',
            run: (view) => {
              if (view.state.field(actions, false)) {
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
    ],
  };
}

/**
 * Returns the server's code actions for `range` and its `diagnostics`, with quick fixes first.
 */
export async function requestActions(
  view: EditorView,
  range: Range,
  diagnostics: Diagnostic[],
): Promise<{ actions: CodeAction[]; doc: Text }> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.serverCapabilities?.codeActionProvider) {
    return { actions: [], doc: view.state.doc };
  }

  plugin.client.sync();
  const doc = view.state.doc;
  const response = await plugin.client.request<CodeActionParams, (Command | CodeAction)[] | null>(
    'textDocument/codeAction',
    {
      textDocument: { uri: plugin.uri },
      range,
      context: { diagnostics, triggerKind: CodeActionTriggerKind.Invoked },
    },
  );

  const rank = (action: CodeAction) => (isFix(action) ? (action.isPreferred ? 0 : 1) : 2);
  return {
    actions: (response ?? [])
      // Wraps a bare command in an action.
      .map(
        (item): CodeAction =>
          typeof item.command === 'string' ? { title: item.title, command: item as Command } : (item as CodeAction),
      )
      .filter((action) => !action.disabled)
      .toSorted((a, b) => rank(a) - rank(b)),
    doc,
  };
}

/**
 * Applies `action`'s edits and runs its command.
 *
 * Does nothing if the document has changed since `doc`.
 */
export async function apply(view: EditorView, action: CodeAction | undefined, doc: Text): Promise<void> {
  const plugin = LSPPlugin.get(view);
  if (!plugin || !action || view.state.doc !== doc) {
    return;
  }

  if (view.state.field(actions, false)) {
    view.dispatch({ effects: closeActions.of(null) });
  }

  // DO NOT REORDER.
  try {
    let resolved = action;
    const provider = plugin.client.serverCapabilities?.codeActionProvider;
    if (!action.edit && action.data !== undefined && typeof provider === 'object' && provider.resolveProvider) {
      resolved = await plugin.client.request<CodeAction, CodeAction>('codeAction/resolve', action);
      if (view.state.doc !== doc) {
        return;
      }
    }

    if (resolved.edit) {
      const { applied, failureReason } = applyWorkspaceEdit(plugin.client, resolved.edit);
      if (!applied) {
        view.dispatch({
          effects: showMessage.of({
            pos: view.state.selection.main.head,
            text: failureReason ?? "The edit didn't apply.",
          }),
        });
        return;
      }
    }

    if (resolved.command) {
      const { command, arguments: args } = resolved.command;
      await plugin.client.request<ExecuteCommandParams, unknown>('workspace/executeCommand', {
        command,
        arguments: args,
      });
    }
  } catch (error) {
    view.dispatch({
      effects: showMessage.of({
        pos: view.state.selection.main.head,
        text: (error as { message?: string }).message ?? String(error),
      }),
    });
  }
  // DO NOT REORDER.
}

/**
 * Returns whether `action` is a quick fix.
 */
export function isFix(action: CodeAction): boolean {
  return action.kind === 'quickfix' || Boolean(action.kind?.startsWith('quickfix.'));
}

/**
 * Moves the popup's selection by `by`, wrapping around.
 */
function move(view: EditorView, by: number): boolean {
  const value = view.state.field(actions, false);
  if (!value) {
    return false;
  }

  const count = value.actions.length;
  view.dispatch({ effects: selectAction.of((((value.selected + by) % count) + count) % count) });
  return true;
}

/**
 * Returns the range and diagnostics to request code actions for at the cursor.
 *
 * Falls back to the problems on the cursor's line when the selection touches none.
 */
function at(view: EditorView, plugin: LSPPlugin): [Range, Diagnostic[]] {
  const { state } = view;
  const { from, to } = state.selection.main;
  const line = state.doc.lineAt(state.selection.main.head);
  const found = state.field(problems, false) ?? [];
  const touching = found.filter((problem) => problem.from <= to && problem.to >= from);
  const near = found.filter((problem) => problem.from <= line.to && problem.to >= line.from);

  const [first] = near;
  if (touching.length === 0 && first) {
    return [{ start: plugin.toPosition(first.from), end: plugin.toPosition(first.to) }, near.map(({ item }) => item)];
  }
  return [{ start: plugin.toPosition(from), end: plugin.toPosition(to) }, touching.map(({ item }) => item)];
}

function popup(view: EditorView, value: Actions) {
  const dom = document.createElement('div');
  dom.className = 'cm-lsp-actions';

  const list = dom.appendChild(document.createElement('ul'));
  list.className = 'cm-lsp-actions-list';
  list.role = 'listbox';
  list.ariaLabel = 'Actions';
  const options = value.actions.map((action, i) => {
    // Divides the quick fixes from the rest.
    if (i > 0 && isFix(value.actions[i - 1]) && !isFix(action)) {
      list.appendChild(
        Object.assign(document.createElement('li'), { className: 'cm-lsp-actions-divider', role: 'separator' }),
      );
    }

    const option = list.appendChild(document.createElement('li'));
    option.className = isFix(action) ? 'cm-lsp-action cm-lsp-action-fix' : 'cm-lsp-action';
    option.role = 'option';
    // Pads the bulb, which would otherwise look larger than the letters in the completion list's icons.
    option.innerHTML = `<svg class="cm-lsp-action-bulb" viewBox="-1 -1 18 18" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${isFix(action) ? BULB + MARK : BULB}"/></svg>`;
    appendCode(option.appendChild(document.createElement('span')), action.title);
    return option;
  });

  dom.append(
    hint('cm-lsp-actions-hint', [
      ['Enter', 'apply'],
      ['Escape', 'close'],
    ]),
  );

  // Keeps the focus in the editor, as completion does.
  dom.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const index = options.findIndex((option) => option.contains(event.target as Node));
    void apply(view, value.actions[index], view.state.doc);
  });

  let selected = -1;
  const select = () => {
    const current = view.state.field(actions, false);
    if (!current || current.selected === selected) {
      return;
    }

    options[selected]?.removeAttribute('aria-selected');
    selected = current.selected;
    options[selected]?.setAttribute('aria-selected', 'true');
  };

  return { dom, mount: select, update: select };
}
