import { foldEffect, foldedRanges } from '@codemirror/language';
import { setDiagnostics } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { EditorDiagnostic } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { diagnostics } from '@/editor/diagnostics';
import { hover } from '@/editor/hover';
import { stripe, stripeMarks } from '@/editor/stripe/stripe';
import { METRICS } from '@/editor/theme';
import { commandsExtension } from '../../../test/commands';

const LINES = 200;
const DOC = Array.from({ length: LINES }, (_, i) => `line ${i + 1}`).join('\n');

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

// Opens `doc` in an editor 400px high, with `initial` diagnostics and `extensions`.
function open(initial: EditorDiagnostic[], doc = DOC, extensions: Extension = []): EditorView {
  // The editor's metrics make it fill its host.
  const host = document.body.appendChild(document.createElement('div'));
  host.style.height = '400px';
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [diagnostics, stripe(), METRICS, hover(), commandsExtension(), extensions],
    }),
    parent: host,
  });
  view.dispatch(setDiagnostics(view.state, initial));
  views.push(view);
  return view;
}

// Returns a diagnostic over the `line`th line of `DOC`, from 1.
function at(line: number, severity: EditorDiagnostic['severity'] = 'error', message = `${severity} ${line}`) {
  const from = DOC.indexOf(`line ${line}\n`);
  return { from, to: from + `line ${line}`.length, severity, message };
}

// Waits for the stripe to be drawn, and returns its marks of `kind`, or all of them.
function marks(view: EditorView, kind?: string): Promise<HTMLElement[]> {
  return vi.waitFor(() => {
    const found = [...view.dom.querySelectorAll<HTMLElement>(`.cm-stripe-mark${kind ? `-${kind}` : ''}`)];
    expect(found).not.toHaveLength(0);
    return found;
  });
}

// Returns where `mark` is painted on the stripe, without the pointer's tolerance around it.
function painted(mark: HTMLElement): { top: number; height: number } {
  const padding = Number.parseFloat(getComputedStyle(mark).paddingTop);
  const box = mark.getBoundingClientRect();
  const stripe = (mark.parentElement as HTMLElement).getBoundingClientRect();
  return { top: box.top - stripe.top + padding, height: box.height - 2 * padding };
}

// Points at, or clicks, the middle of `mark`.
function point(mark: HTMLElement, type = 'mousemove'): void {
  const { left, right, top, bottom } = mark.getBoundingClientRect();
  const [x, y] = [(left + right) / 2, (top + bottom) / 2];
  document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

// Waits for the stripe's tooltip to open in `view`, and returns it.
function opened(view: EditorView): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const tooltip = view.dom.querySelector<HTMLElement>('.cm-stripe-tooltip');
    expect(tooltip).not.toBeNull();
    return tooltip as HTMLElement;
  });
}

describe('stripe', () => {
  test('covers scrollbar track', async () => {
    const view = open([at(1)]);
    await marks(view);

    const stripe = view.dom.querySelector<HTMLElement>('.cm-stripe') as HTMLElement;
    const { scrollDOM } = view;
    expect(stripe.getBoundingClientRect().right).toBe(scrollDOM.getBoundingClientRect().right);
    expect(stripe.offsetTop).toBe(scrollDOM.offsetTop);
    expect(stripe.offsetHeight).toBe(scrollDOM.clientHeight);
  });

  test('scales marks to track when document is taller', async () => {
    const view = open([at(100)]);
    const [mark] = await marks(view, 'error');

    const { scrollDOM } = view;
    const scale = scrollDOM.clientHeight / scrollDOM.scrollHeight;
    const line = view.lineBlockAt(at(100).from);
    expect(painted(mark).top).toBeCloseTo((line.top + view.documentPadding.top) * scale, 0);
    expect(scale).toBeLessThan(1);
  });

  test('lays marks at lines when document fits, two pixels high on one line', async () => {
    const short = 'one\ntwo\nthree';
    const view = open([{ from: 4, to: 7, severity: 'error', message: 'two' }], short);
    const [mark] = await marks(view, 'error');

    const line = view.lineBlockAt(4);
    expect(painted(mark).top).toBeCloseTo(line.top + view.documentPadding.top, 0);
    expect(painted(mark).height).toBe(2);
  });

  test('spans lines to top of last', async () => {
    const short = 'one\ntwo\nthree\nfour';
    const view = open([{ from: 0, to: 10, severity: 'error', message: 'to three' }], short);
    const [mark] = await marks(view, 'error');

    expect(painted(mark).height).toBeCloseTo(view.lineBlockAt(10).top - view.lineBlockAt(0).top, 0);
  });

  test('keeps marks apart on neighbouring lines', async () => {
    const short = 'one\ntwo\nthree';
    const view = open(
      [
        { from: 0, to: 3, severity: 'error', message: 'one' },
        { from: 4, to: 7, severity: 'error', message: 'two' },
      ],
      short,
    );

    expect(await marks(view, 'error')).toHaveLength(2);
  });

  test('merges touching marks of kind, keeping kinds apart with higher severity above', async () => {
    const view = open([at(100), at(101), at(100, 'warning')]);
    expect(view.scrollDOM.scrollHeight).toBeGreaterThan(view.scrollDOM.clientHeight);
    await marks(view);

    const all = await marks(view);
    expect(all.map((mark) => mark.className)).toEqual([
      'cm-stripe-mark cm-stripe-mark-warning',
      'cm-stripe-mark cm-stripe-mark-error',
    ]);
    expect(painted(all[1]).height).toBeGreaterThan(painted(all[0]).height);
  });

  test('moves marks with edits before next diagnostics', async () => {
    const view = open([at(100)]);
    const [before] = await marks(view, 'error');
    const top = painted(before).top;

    // Deletes the first 50 lines, which the lint field maps the diagnostic through.
    view.dispatch({ changes: { from: 0, to: DOC.indexOf('line 51\n') } });

    const scale = view.scrollDOM.clientHeight / view.scrollDOM.scrollHeight;
    const line = view.lineBlockAt(view.state.doc.toString().indexOf('line 100\n'));
    await vi.waitFor(() => {
      const [after] = view.dom.querySelectorAll<HTMLElement>('.cm-stripe-mark-error');
      expect(painted(after).top).toBeCloseTo((line.top + view.documentPadding.top) * scale, 0);
    });
    expect(painted(view.dom.querySelector<HTMLElement>('.cm-stripe-mark-error') as HTMLElement).top).toBeLessThan(top);
  });

  test('follows document edits', async () => {
    const view = open([at(1)]);
    await marks(view);

    view.dispatch(setDiagnostics(view.state, [at(100), at(150)]));
    await vi.waitFor(() => expect(view.dom.querySelectorAll('.cm-stripe-mark')).toHaveLength(2));

    view.dispatch(setDiagnostics(view.state, []));
    await vi.waitFor(() => expect(view.dom.querySelectorAll('.cm-stripe-mark')).toHaveLength(0));
  });

  test('marks sources, by their layer', async () => {
    const source = { update: () => false, marks: () => [{ ...at(100), kind: 'searchMatch' as const }] };
    const view = open([at(100)], DOC, stripeMarks.of(source));
    const all = await marks(view);

    expect(all.map((mark) => mark.classList[1])).toEqual(['cm-stripe-mark-error', 'cm-stripe-mark-searchMatch']);
  });

  test('asks only sources that changed', async () => {
    const asked = { still: 0, moving: 0 };
    const view = open([], DOC, [
      stripeMarks.of({
        update: () => false,
        marks: () => {
          asked.still += 1;
          return [{ ...at(10), kind: 'usage' }];
        },
      }),
      stripeMarks.of({
        update: (update) => update.selectionSet,
        marks: () => {
          asked.moving += 1;
          return [{ ...at(20), kind: 'usage' }];
        },
      }),
    ]);
    await marks(view);

    view.dispatch({ selection: { anchor: 5 } });
    await vi.waitFor(() => expect(asked.moving).toBe(2));

    expect(asked.still).toBe(1);
    expect(view.dom.querySelectorAll('.cm-stripe-mark-usage')).toHaveLength(2);
  });

  test('shows diagnostics under pointer once, highest severity first', async () => {
    const view = open([
      at(100, 'warning', 'later'),
      at(100, 'error', 'first'),
      at(101, 'warning', 'later'),
      at(150, 'error', 'elsewhere'),
    ]);
    const [mark] = await marks(view, 'error');

    point(mark);
    const tooltip = await opened(view);

    expect([...tooltip.querySelectorAll('.cm-diagnosticMessage')].map((message) => message.textContent)).toEqual([
      'first',
      'later',
    ]);
    expect(tooltip.classList.contains('cm-tooltip-hover')).toBe(true);
  });

  test('keeps tooltip centred on mark within editor', async () => {
    const view = open([at(1), at(100)]);
    const [first, middle] = await marks(view, 'error');

    point(first);
    const top = await opened(view);
    expect(top.offsetTop).toBe(0);

    point(middle);
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-stripe-tooltip')).not.toBe(top));
    const tooltip = await opened(view);
    const { top: markTop, height } = painted(middle);
    expect(tooltip.offsetTop + tooltip.offsetHeight / 2).toBeCloseTo(markTop + height / 2, 0);
    expect(tooltip.getBoundingClientRect().right).toBeLessThan(middle.getBoundingClientRect().left);
  });

  test('hides tooltip once pointer leaves, unless onto tooltip', async () => {
    const view = open([at(100)]);
    const [mark] = await marks(view, 'error');

    point(mark);
    const tooltip = await opened(view);
    mark.parentElement?.dispatchEvent(new MouseEvent('mouseleave'));
    tooltip.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(view.dom.querySelector('.cm-stripe-tooltip')).toBe(tooltip);

    tooltip.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-stripe-tooltip')).toBeNull());
  });

  test('hides tooltip when diagnostics change', async () => {
    const view = open([at(100)]);
    const [mark] = await marks(view, 'error');
    point(mark);
    await opened(view);

    view.dispatch(setDiagnostics(view.state, [at(100), at(120)]));

    expect(view.dom.querySelector('.cm-stripe-tooltip')).toBeNull();
  });

  test('hides tooltip on its actions', async () => {
    const view = open([{ ...at(100), actions: [{ name: 'Fix', type: 'fix', apply: () => {} }] }]);
    const [mark] = await marks(view, 'error');
    point(mark);
    const tooltip = await opened(view);

    const more = [...tooltip.querySelectorAll('button')].find((button) => button.textContent === 'More actions');
    more?.click();

    expect(view.dom.querySelector('.cm-stripe-tooltip')).toBeNull();
  });

  test('hides tooltip on Escape', async () => {
    const view = open([at(100)]);
    const [mark] = await marks(view, 'error');

    point(mark);
    await opened(view);
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(view.dom.querySelector('.cm-stripe-tooltip')).toBeNull();
  });

  test('keeps editor focused while pressed', async () => {
    const view = open([at(100)]);
    view.focus();
    const [mark] = await marks(view, 'error');

    point(mark, 'mousedown');

    expect(view.hasFocus).toBe(true);
  });

  test('jumps to visible mark without scrolling', async () => {
    const view = open([at(3)]);
    const [mark] = await marks(view, 'error');

    point(mark, 'click');

    expect(view.state.selection.main.head).toBe(at(3).from);
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  test('jumps to mark, unfolding it', async () => {
    const view = open([at(100)]);
    const { from } = at(100);
    view.dispatch({ effects: foldEffect.of({ from: DOC.indexOf('line 90'), to: DOC.indexOf('line 110') }) });
    const [mark] = await marks(view, 'error');

    point(mark, 'click');

    expect(view.state.selection.main.head).toBe(from);
    expect(foldedRanges(view.state).size).toBe(0);
    const coords = view.coordsAtPos(from);
    const bounds = view.scrollDOM.getBoundingClientRect();
    expect(coords).not.toBeNull();
    expect(coords?.top).toBeGreaterThan(bounds.top);
    expect(coords?.bottom).toBeLessThan(bounds.bottom);
    expect(view.hasFocus).toBe(true);
  });
});
