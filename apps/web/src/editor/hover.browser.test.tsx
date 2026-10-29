import { type Diagnostic, linter, setDiagnostics } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { EditorActionSource, EditorDiagnostic } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { diagnostics } from '@/editor/diagnostics';
import { COMMANDS } from '@/editor/editor-manager';
import { closeHoverOnClick, EDITOR_SHOW_HOVER, hover } from '@/editor/hover';
import { commandsExtension } from '../../test/commands';

const DOC = 'let channel = attach(1);';

// The diagnostic with `attach`.
const DIAGNOSTIC: EditorDiagnostic = {
  from: DOC.indexOf('attach'),
  to: DOC.indexOf('attach') + 'attach'.length,
  severity: 'error',
  message: 'cannot find `attach`',
};

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` with `initial` diagnostics and `extensions`, without a language server.
function open(initial: EditorDiagnostic[], extensions: Extension = []): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: [diagnostics, hover(), commandsExtension(), extensions] }),
    parent: document.body,
  });
  view.dispatch(setDiagnostics(view.state, initial));
  views.push(view);
  return view;
}

// Moves the pointer `dx` pixels right of where `pos` starts in `view`.
function point(view: EditorView, pos: number, dx = 1): void {
  const { left, top, bottom } = view.coordsAtPos(pos) as DOMRect;
  const [x, y] = [left + dx, (top + bottom) / 2];
  document
    .elementFromPoint(x, y)
    ?.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

// Clicks `pos` in `view` without moving the pointer.
function press(view: EditorView, pos: number): void {
  const { left, top, bottom } = view.coordsAtPos(pos) as DOMRect;
  const [x, y] = [left + 1, (top + bottom) / 2];
  const target = document.elementFromPoint(x, y);
  target?.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, buttons: 1 }));
  target?.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }));
}

// Returns a source of a section named `name`, at `order`.
function section(name: string, order?: number): Extension {
  const source = async (_: EditorView, pos: number) => ({
    pos,
    create: () => ({ dom: Object.assign(document.createElement('div'), { className: name }) }),
  });
  const section = { source, order };
  return EditorState.languageData.of(() => [{ hover: section }]);
}

// Returns the names of `tooltip`'s sections, `diagnostics` for the diagnostics.
function names(tooltip: HTMLElement): string[] {
  return [...tooltip.querySelectorAll('.cm-tooltip-section')].map((element) =>
    element.classList.contains('cm-tooltip-lint') ? 'diagnostics' : element.classList[0],
  );
}

// Waits past the delay before a hover opens.
function rest(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600));
}

// Waits for the hover to open in `view`, and returns it.
function opened(view: EditorView): Promise<HTMLElement> {
  return vi.waitFor(
    () => {
      const tooltip = view.dom.querySelector<HTMLElement>('.cm-tooltip-hover');
      expect(tooltip).not.toBeNull();
      return tooltip as HTMLElement;
    },
    { timeout: 2000 },
  );
}

describe('hover', () => {
  test('shows diagnostic with source, without server', async () => {
    const view = open([{ ...DIAGNOSTIC, source: 'lint' }]);

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnostic-error .cm-diagnosticMessage code')?.textContent).toBe('attach');
    expect(tooltip.querySelector('.cm-diagnosticMeta')?.textContent).toBe('lint');
  });

  test('shows code, linking only to web', async () => {
    const view = open([
      { ...DIAGNOSTIC, source: 'eslint', code: 'no-var', codeHref: 'https://eslint.org/docs/latest/rules/no-var' },
      { ...DIAGNOSTIC, code: 7, codeHref: 'javascript:alert(1)' },
    ]);

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    const metas = [...tooltip.querySelectorAll('.cm-diagnosticMeta')];
    expect(metas.map((meta) => meta.textContent)).toEqual(['eslint · no-var', '7']);
    expect(metas[0].querySelector('a')?.getAttribute('href')).toBe('https://eslint.org/docs/latest/rules/no-var');
    expect(metas[1].querySelector('a')).toBeNull();
  });

  test('shows diagnostic starting just after pointer', async () => {
    const view = open([DIAGNOSTIC]);

    point(view, DIAGNOSTIC.from, -1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnostic-error')).not.toBeNull();
  });

  test('shows diagnostic ending just before pointer', async () => {
    const view = open([DIAGNOSTIC]);

    point(view, DIAGNOSTIC.to, 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnostic-error')).not.toBeNull();
  });

  test('shows diagnostics once', async () => {
    const view = open([DIAGNOSTIC]);

    point(view, DIAGNOSTIC.from + 1);
    await opened(view);
    await rest();

    expect(view.dom.querySelectorAll('.cm-tooltip-lint')).toHaveLength(1);
  });

  test('passes diagnostics to plugin tooltip filter', async () => {
    const filtered: (readonly Diagnostic[] | null)[] = [];
    const view = open(
      [DIAGNOSTIC],
      linter(() => [DIAGNOSTIC], {
        tooltipFilter: (diagnostics) => {
          filtered.push(diagnostics);
          return diagnostics.filter(() => true);
        },
      }),
    );

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);
    await rest();

    expect(tooltip.querySelectorAll('.cm-diagnosticMessage')).toHaveLength(1);
    expect(view.dom.querySelectorAll('.cm-tooltip-lint')).toHaveLength(1);
    expect(filtered).not.toHaveLength(0);
    expect(filtered.every(Array.isArray)).toBe(true);
  });

  test('renders custom message', async () => {
    const view = open([
      { ...DIAGNOSTIC, renderMessage: () => Object.assign(document.createElement('b'), { textContent: 'own' }) },
    ]);

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnosticMessage b')?.textContent).toBe('own');
  });

  test('shows top fix and more actions, applies on click', async () => {
    const view = open([
      {
        ...DIAGNOSTIC,
        actions: [
          {
            name: 'Rename to `connect`',
            type: 'fix',
            apply: (view, from, to) => view.dispatch({ changes: { from, to, insert: 'connect' } }),
          },
          { name: 'Ignore', apply: () => {} },
        ],
      },
    ]);

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);
    const line = tooltip.querySelector('.cm-actions-hover') as HTMLElement;

    expect([...line.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Rename to connect',
      'More actions',
    ]);
    line.querySelector('button')?.click();
    expect(view.state.doc.toString()).toBe('let channel = connect(1);');
  });

  test('shows diagnostic fix past stalled source', async () => {
    const stalled: EditorActionSource = { actions: () => new Promise(() => {}) };
    const view = open(
      [{ ...DIAGNOSTIC, actions: [{ name: 'Rename to `connect`', type: 'fix', apply: () => {} }] }],
      EditorState.languageData.of(() => [{ actions: stalled }]),
    );

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-actions-hover button')?.textContent).toBe('Rename to connect');
  });

  test('shows fix past stalled source', async () => {
    const stalled: EditorActionSource = { actions: () => new Promise(() => {}) };
    const fast: EditorActionSource = {
      actions: async () => [{ label: 'Import `attach`', type: 'fix', apply: () => {} }],
    };
    const view = open(
      [DIAGNOSTIC],
      EditorState.languageData.of(() => [{ actions: stalled }, { actions: fast }]),
    );

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-actions-hover button')?.textContent).toBe('Import attach');
  });

  test('shows sections without order below diagnostics', async () => {
    const view = open([DIAGNOSTIC], [section('docs')]);

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    await vi.waitFor(() => expect(names(tooltip)).toEqual(['diagnostics', 'docs']));
  });

  test('shows sections lowest order first, rest last', async () => {
    const view = open([DIAGNOSTIC], [section('last'), section('late', 30), section('early', 5)]);

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    await vi.waitFor(() => expect(names(tooltip)).toEqual(['early', 'diagnostics', 'late', 'last']));
  });

  test('keeps equal orders as added', async () => {
    const view = open([DIAGNOSTIC], [section('first', 10), section('second', 10)]);

    point(view, DIAGNOSTIC.from + 1);
    const tooltip = await opened(view);

    await vi.waitFor(() => expect(names(tooltip)).toEqual(['diagnostics', 'first', 'second']));
  });

  test('closes on click, until pointer moves', async () => {
    const view = open([DIAGNOSTIC], closeHoverOnClick.of(true));
    point(view, DIAGNOSTIC.from + 1);
    await opened(view);

    press(view, DIAGNOSTIC.from + 1);
    await rest();
    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();

    point(view, DIAGNOSTIC.from + 3);
    await opened(view);
  });

  test('stays open on click, unless set', async () => {
    const view = open([DIAGNOSTIC]);
    point(view, DIAGNOSTIC.from + 1);
    await opened(view);

    press(view, DIAGNOSTIC.from + 1);
    await rest();

    expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull();
  });

  test('closes on Escape', async () => {
    const view = open([DIAGNOSTIC]);
    point(view, DIAGNOSTIC.from + 1);
    await opened(view);

    const close = () => runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Escape' }), 'editor');
    expect(close()).toBe(true);
    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
    expect(close()).toBe(false);
  });
});

describe('EDITOR_SHOW_HOVER', () => {
  // Puts the cursor at `pos`, runs the command, and returns the hover that opens.
  async function show(view: EditorView, pos: number): Promise<HTMLElement> {
    view.dispatch({ selection: { anchor: pos } });
    expect(view.state.facet(COMMANDS)?.run(EDITOR_SHOW_HOVER.id, view)).toBe(true);
    return opened(view);
  }

  test('shows diagnostics of word cursor ends', async () => {
    const view = open([DIAGNOSTIC]);

    const tooltip = await show(view, DIAGNOSTIC.to);

    expect(tooltip.querySelector('.cm-diagnosticMessage')?.textContent).toBe('cannot find attach');
  });

  test('opens after click closed hover', async () => {
    const view = open([DIAGNOSTIC], closeHoverOnClick.of(true));
    press(view, DIAGNOSTIC.from + 1);

    await show(view, DIAGNOSTIC.from + 1);
  });

  test('stays open on pointer move', async () => {
    const view = open([DIAGNOSTIC]);
    await show(view, DIAGNOSTIC.from + 1);

    point(view, DOC.indexOf('channel'));
    await rest();

    expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull();
  });

  test('closes on cursor move', async () => {
    const view = open([DIAGNOSTIC]);
    await show(view, DIAGNOSTIC.from + 1);

    view.dispatch({ selection: { anchor: DOC.indexOf('channel') } });

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('closes on typing', async () => {
    const view = open([DIAGNOSTIC]);
    await show(view, DIAGNOSTIC.from + 1);

    view.dispatch({ changes: { from: 0, insert: ' ' }, userEvent: 'input.type' });

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('closes on Escape', async () => {
    const view = open([DIAGNOSTIC]);
    await show(view, DIAGNOSTIC.from + 1);

    expect(runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Escape' }), 'editor')).toBe(true);
    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('shows nothing without diagnostics', async () => {
    const view = open([]);

    view.dispatch({ selection: { anchor: DIAGNOSTIC.from + 1 } });
    view.state.facet(COMMANDS)?.run(EDITOR_SHOW_HOVER.id, view);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });
});
