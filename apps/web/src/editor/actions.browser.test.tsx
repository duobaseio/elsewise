import { history, undo } from '@codemirror/commands';
import { forceParsing, LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { setDiagnostics } from '@codemirror/lint';
import { EditorState, type Extension, StateEffect } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import type { EditorAction, EditorActionSource, EditorDiagnostic } from '@elsewise/plugin';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { actions } from '@/editor/actions';
import { commandsExtension } from '../../test/commands';

const DOC = 'let total = shout(1);\nlet other = 2;';

// The diagnostic with `shout`, which isn't imported.
const DIAGNOSTIC: EditorDiagnostic = {
  from: DOC.indexOf('shout'),
  to: DOC.indexOf('shout') + 'shout'.length,
  severity: 'error',
  message: 'cannot find `shout`',
};

const IMPORT = 'import { shout } from "./util";\n';

// Adds the import of `shout`.
const ADD_IMPORT: EditorAction = {
  label: 'Add import from "./util"',
  type: 'fix',
  apply: (view) => view.dispatch({ changes: { from: 0, insert: IMPORT } }),
};

const ORGANIZE: EditorAction = { label: 'Organize imports', apply: () => {} };

const SORT: EditorAction = { label: 'Sort imports', apply: () => {} };

let html: LanguageSupport;
let javascript: LanguageSupport;

beforeAll(async () => {
  html = await (LanguageDescription.matchFilename(languages, 'index.html') as LanguageDescription).load();
  javascript = await (LanguageDescription.matchFilename(languages, 'main.js') as LanguageDescription).load();
});

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
  vi.restoreAllMocks();
});

// Returns a source of `found`, at `order`.
function source(found: readonly EditorAction[], order?: number): EditorActionSource {
  return { order, actions: vi.fn(async () => found) };
}

// Opens `doc` with the cursor in `shout`, the `sources` and `diagnostics`, as a plugin's extension adds them.
function open(
  sources: readonly EditorActionSource[],
  diagnostics: readonly EditorDiagnostic[] = [DIAGNOSTIC],
  doc = DOC,
  extensions: Extension = [],
): EditorView {
  const data = sources.map((source) => ({ actions: source }));
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: Math.max(doc.indexOf('shout'), 0) + 2 },
      extensions: [actions(), EditorState.languageData.of(() => data), commandsExtension(), history(), extensions],
    }),
    parent: document.body,
  });
  view.dispatch(setDiagnostics(view.state, diagnostics));
  views.push(view);
  view.focus();
  return view;
}

function press(view: EditorView, key: string, modifiers: KeyboardEventInit = {}): boolean {
  return runScopeHandlers(view, new KeyboardEvent('keydown', { key, ...modifiers }), 'editor');
}

// Presses Alt-Enter, and returns the popup's rows once it shows, with `-` for its divider.
async function show(view: EditorView): Promise<string[]> {
  expect(press(view, 'Enter', { altKey: true })).toBe(true);
  return vi.waitFor(() => {
    const rows = [...view.dom.querySelectorAll('.cm-action, .cm-actions-divider')];
    expect(rows.length).toBeGreaterThan(0);
    return rows.map((row) => (row.classList.contains('cm-actions-divider') ? '-' : (row.textContent ?? '')));
  });
}

// Waits for the message, and returns its text.
function message(view: EditorView): Promise<string | null | undefined> {
  return vi.waitFor(() => {
    const message = view.dom.querySelector('.cm-actions-message');
    expect(message).not.toBeNull();
    return message?.textContent;
  });
}

describe('actions', () => {
  test('lists preferred fixes, fixes, then rest by order', async () => {
    const other = { ...ADD_IMPORT, label: 'Other fix' };
    const view = open([
      source([SORT], 30),
      source([ORGANIZE, other], 20),
      source([{ ...ADD_IMPORT, type: 'preferredFix' }]),
    ]);

    expect(await show(view)).toEqual([
      'Add import from "./util"',
      'Other fix',
      '-',
      'Organize imports',
      'Sort imports',
    ]);
    expect([...view.dom.querySelectorAll('.cm-action-fix')].map((row) => row.textContent)).toEqual([
      'Add import from "./util"',
      'Other fix',
    ]);
  });

  test('asks sources about diagnostic at cursor', async () => {
    const found = source([ORGANIZE]);
    const view = open([found]);

    await show(view);

    expect(found.actions).toHaveBeenCalledWith(view, view.state.selection.main.from, view.state.selection.main.to, [
      DIAGNOSTIC,
    ]);
  });

  test('passes diagnostics mapped through edits', async () => {
    const found = source([ORGANIZE]);
    const view = open([found]);
    view.dispatch({ changes: { from: 0, insert: '\n' } });

    await show(view);

    expect(found.actions).toHaveBeenCalledWith(view, expect.any(Number), expect.any(Number), [
      { ...DIAGNOSTIC, from: DIAGNOSTIC.from + 1, to: DIAGNOSTIC.to + 1 },
    ]);
  });

  test('applies diagnostic action mapped through edits', async () => {
    const view = open(
      [],
      [
        {
          ...DIAGNOSTIC,
          actions: [
            {
              name: 'Rename to `print`',
              apply: (view, from, to) => view.dispatch({ changes: { from, to, insert: 'print' } }),
            },
          ],
        },
      ],
    );
    view.dispatch({ changes: { from: 0, insert: '\n' } });
    await show(view);

    press(view, 'Enter');

    expect(view.state.doc.toString()).toBe(`\n${DOC.replace('shout', 'print')}`);
  });

  test('falls back to diagnostics on cursor line', async () => {
    const found = source([ORGANIZE]);
    const view = open([found]);
    view.dispatch({ selection: { anchor: 2 } });

    await show(view);

    expect(found.actions).toHaveBeenCalledWith(view, DIAGNOSTIC.from, DIAGNOSTIC.to, [DIAGNOSTIC]);
  });

  test('lists diagnostic actions by type', async () => {
    const view = open(
      [source([ORGANIZE])],
      [
        {
          ...DIAGNOSTIC,
          actions: [
            { name: 'Ignore', apply: () => {} },
            {
              name: 'Rename to `print`',
              type: 'fix',
              apply: (view, from, to) => view.dispatch({ changes: { from, to, insert: 'print' } }),
            },
          ],
        },
      ],
    );

    expect(await show(view)).toEqual(['Rename to print', '-', 'Ignore', 'Organize imports']);
    press(view, 'Enter');

    expect(view.state.doc.toString()).toBe(DOC.replace('shout', 'print'));
  });

  test('uses sources of nested language at cursor', async () => {
    const doc = '<p>a</p>\n<script>\nlet total = shout(1);\n</script>';
    const found = source([ORGANIZE]);
    const view = open([], [], doc, [html, javascript.language.data.of({ actions: found })]);
    forceParsing(view, doc.length);

    expect(await show(view)).toEqual(['Organize imports']);
  });

  test('renders backticks in label as code', async () => {
    const view = open([source([{ ...ADD_IMPORT, label: 'Import `shout` from `./util`' }])]);

    expect(await show(view)).toEqual(['Import shout from ./util']);
    const row = view.dom.querySelector('.cm-action > span') as HTMLElement;
    expect([...row.querySelectorAll('code')].map((code) => code.textContent)).toEqual(['shout', './util']);
  });

  test('applies selected action on Enter, in one undo step', async () => {
    const view = open([source([ADD_IMPORT, ORGANIZE])]);
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
    expect(view.dom.querySelector('.cm-actions')).toBeNull();
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('applies clicked action', async () => {
    const view = open([source([ORGANIZE, ADD_IMPORT])]);
    await show(view);

    (view.dom.querySelector('.cm-action-fix') as HTMLElement).click();

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
  });

  test('moves selection with arrows, and closes on Escape', async () => {
    const view = open([source([ADD_IMPORT, ORGANIZE, SORT])]);
    await show(view);

    press(view, 'ArrowUp');
    expect(view.dom.querySelector('[aria-selected]')?.textContent).toBe('Sort imports');
    expect(press(view, 'Escape')).toBe(true);

    expect(view.dom.querySelector('.cm-actions')).toBeNull();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('applies preferred fix on Shift-Alt-Enter, without popup', async () => {
    const other = { ...ADD_IMPORT, label: 'Other fix', apply: vi.fn() };
    const view = open([source([ORGANIZE, other, { ...ADD_IMPORT, type: 'preferredFix' }])]);

    expect(press(view, 'Enter', { altKey: true, shiftKey: true })).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
    expect(other.apply).not.toHaveBeenCalled();
    expect(view.dom.querySelector('.cm-actions')).toBeNull();
  });

  test('shows nothing on Shift-Alt-Enter without fix', async () => {
    const found = source([ORGANIZE]);
    const view = open([found]);

    press(view, 'Enter', { altKey: true, shiftKey: true });
    await vi.waitFor(() => expect(found.actions).toHaveBeenCalledTimes(1));
    await new Promise(requestAnimationFrame);

    expect(view.dom.querySelector('.cm-tooltip')).toBeNull();
  });

  test('shows no-actions message, closing on Escape', async () => {
    const view = open([source([])]);

    press(view, 'Enter', { altKey: true });

    expect(await message(view)).toBe('No context actions available');
    expect(view.dom.querySelector('.cm-actions')).toBeNull();
    expect(press(view, 'Escape')).toBe(true);
    expect(view.dom.querySelector('.cm-actions-message')).toBeNull();
  });

  test('lists actions past failing source', async () => {
    const view = open([{ actions: () => Promise.reject(new Error('Crashed')) }, source([ORGANIZE])]);

    expect(await show(view)).toEqual(['Organize imports']);
  });

  test('lists actions past throwing source', async () => {
    const throwing: EditorActionSource = {
      actions: () => {
        throw new Error('Crashed');
      },
    };
    const view = open([throwing, source([ORGANIZE])]);

    expect(await show(view)).toEqual(['Organize imports']);
  });

  test('shows no-actions message past failing source, until cursor moves', async () => {
    const view = open([{ actions: () => Promise.reject(new Error('Crashed')) }]);

    press(view, 'Enter', { altKey: true });

    expect(await message(view)).toBe('No context actions available');
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector('.cm-actions-message')).toBeNull();
  });

  test('reports failed action', async () => {
    const add = vi.spyOn(toast, 'add');
    const view = open([source([{ label: 'Fail', apply: () => Promise.reject(new Error('No edit')) }])]);
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => {
      expect(add).toHaveBeenCalledWith({ type: 'error', title: 'Applying action failed', description: 'No edit' });
    });
  });

  test("doesn't show or apply actions in read-only document", async () => {
    const found = source([ADD_IMPORT]);
    const view = open([found]);
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });

    expect(press(view, 'Enter', { altKey: true })).toBe(false);
    expect(press(view, 'Enter', { altKey: true, shiftKey: true })).toBe(false);
    await new Promise(requestAnimationFrame);

    expect(found.actions).not.toHaveBeenCalled();
  });
});
