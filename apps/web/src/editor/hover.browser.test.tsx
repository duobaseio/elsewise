import { setDiagnostics } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { EditorDiagnostic } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { COMMANDS } from '@/editor/editor-manager';
import { closeHoverOnClick, hover, hoverSources, SHOW_HOVER } from '@/editor/hover';
import { commandsExtension } from '../../test/commands';

const DOC = 'let channel = attach(1);';

// The problem with `attach`.
const PROBLEM: EditorDiagnostic = {
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

// Opens `DOC` with `diagnostics` and `extensions`, without a language server.
function open(diagnostics: EditorDiagnostic[], extensions: Extension = []): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: [hover(), commandsExtension(), extensions] }),
    parent: document.body,
  });
  view.dispatch(setDiagnostics(view.state, diagnostics));
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
  test('shows problem with source, without server', async () => {
    const view = open([{ ...PROBLEM, source: 'lint' }]);

    point(view, PROBLEM.from + 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnostic-error .cm-diagnosticMessage code')?.textContent).toBe('attach');
    expect(tooltip.querySelector('.cm-diagnosticMeta')?.textContent).toBe('lint');
  });

  test('shows code, linking only to web', async () => {
    const view = open([
      { ...PROBLEM, source: 'eslint', code: 'no-var', codeHref: 'https://eslint.org/docs/latest/rules/no-var' },
      { ...PROBLEM, code: 7, codeHref: 'javascript:alert(1)' },
    ]);

    point(view, PROBLEM.from + 1);
    const tooltip = await opened(view);

    const metas = [...tooltip.querySelectorAll('.cm-diagnosticMeta')];
    expect(metas.map((meta) => meta.textContent)).toEqual(['eslint · no-var', '7']);
    expect(metas[0].querySelector('a')?.getAttribute('href')).toBe('https://eslint.org/docs/latest/rules/no-var');
    expect(metas[1].querySelector('a')).toBeNull();
  });

  test('shows problem starting just after pointer', async () => {
    const view = open([PROBLEM]);

    point(view, PROBLEM.from, -1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnostic-error')).not.toBeNull();
  });

  test('shows problem ending just before pointer', async () => {
    const view = open([PROBLEM]);

    point(view, PROBLEM.to, 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnostic-error')).not.toBeNull();
  });

  test('shows problems once', async () => {
    const view = open([PROBLEM]);

    point(view, PROBLEM.from + 1);
    await opened(view);
    await rest();

    expect(view.dom.querySelectorAll('.cm-tooltip-lint')).toHaveLength(1);
  });

  test("renders problem's own message", async () => {
    const view = open([
      { ...PROBLEM, renderMessage: () => Object.assign(document.createElement('b'), { textContent: 'own' }) },
    ]);

    point(view, PROBLEM.from + 1);
    const tooltip = await opened(view);

    expect(tooltip.querySelector('.cm-diagnosticMessage b')?.textContent).toBe('own');
  });

  test("applies problem's actions on click", async () => {
    const view = open([
      {
        ...PROBLEM,
        actions: [
          {
            name: 'Rename to `connect`',
            apply: (view, from, to) => view.dispatch({ changes: { from, to, insert: 'connect' } }),
          },
          { name: 'Ignore', apply: () => {} },
        ],
      },
    ]);

    point(view, PROBLEM.from + 1);
    const tooltip = await opened(view);
    const line = tooltip.querySelector('.cm-lsp-actions-hover') as HTMLElement;

    expect(line.textContent).toBe('Rename to connect · Ignore');
    line.querySelector('button')?.click();
    expect(view.state.doc.toString()).toBe('let channel = connect(1);');
  });

  test('shows sections below problems', async () => {
    const view = open(
      [PROBLEM],
      [
        hoverSources.of(async (_, pos) => ({
          pos,
          create: () => ({ dom: Object.assign(document.createElement('div'), { className: 'docs' }) }),
        })),
      ],
    );

    point(view, PROBLEM.from + 1);
    const tooltip = await opened(view);

    await vi.waitFor(() => expect(tooltip.querySelectorAll('.cm-tooltip-section')).toHaveLength(2));
    const [first, second] = tooltip.querySelectorAll('.cm-tooltip-section');
    expect(first.querySelector('.cm-diagnostic-error')).not.toBeNull();
    expect(second.classList).toContain('docs');
  });

  test('closes on click, until pointer moves', async () => {
    const view = open([PROBLEM], closeHoverOnClick.of(true));
    point(view, PROBLEM.from + 1);
    await opened(view);

    press(view, PROBLEM.from + 1);
    await rest();
    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();

    point(view, PROBLEM.from + 3);
    await opened(view);
  });

  test('stays open on click, unless set', async () => {
    const view = open([PROBLEM]);
    point(view, PROBLEM.from + 1);
    await opened(view);

    press(view, PROBLEM.from + 1);
    await rest();

    expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull();
  });

  test('closes on Escape', async () => {
    const view = open([PROBLEM]);
    point(view, PROBLEM.from + 1);
    await opened(view);

    const close = () => runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Escape' }), 'editor');
    expect(close()).toBe(true);
    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
    expect(close()).toBe(false);
  });
});

describe('SHOW_HOVER', () => {
  // Puts the cursor at `pos`, runs the command, and returns the hover that opens.
  async function show(view: EditorView, pos: number): Promise<HTMLElement> {
    view.dispatch({ selection: { anchor: pos } });
    expect(view.state.facet(COMMANDS)?.run(SHOW_HOVER.id, view)).toBe(true);
    return opened(view);
  }

  test('shows problems of word cursor ends', async () => {
    const view = open([PROBLEM]);

    const tooltip = await show(view, PROBLEM.to);

    expect(tooltip.querySelector('.cm-diagnosticMessage')?.textContent).toBe('cannot find attach');
  });

  test('stays open on pointer move', async () => {
    const view = open([PROBLEM]);
    await show(view, PROBLEM.from + 1);

    point(view, DOC.indexOf('channel'));
    await rest();

    expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull();
  });

  test('closes on cursor move', async () => {
    const view = open([PROBLEM]);
    await show(view, PROBLEM.from + 1);

    view.dispatch({ selection: { anchor: DOC.indexOf('channel') } });

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('closes on typing', async () => {
    const view = open([PROBLEM]);
    await show(view, PROBLEM.from + 1);

    view.dispatch({ changes: { from: 0, insert: ' ' }, userEvent: 'input.type' });

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('closes on Escape', async () => {
    const view = open([PROBLEM]);
    await show(view, PROBLEM.from + 1);

    expect(runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Escape' }), 'editor')).toBe(true);
    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('shows nothing without problems', async () => {
    const view = open([]);

    view.dispatch({ selection: { anchor: PROBLEM.from + 1 } });
    view.state.facet(COMMANDS)?.run(SHOW_HOVER.id, view);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });
});
