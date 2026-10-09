import { autocompletion, startCompletion } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, showTooltip } from '@codemirror/view';
import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef } from 'react';
import { expect, onTestFinished, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { useThemeExtension } from '@/components/code-editor/theme-extension';
import { visualGuides } from '@/components/code-editor/visual-guides';
import { settingsQuery } from '@/settings/settings';

const { EDITOR } = vi.hoisted(() => ({
  EDITOR: {
    background: '#102030',
    foreground: '#405060',
    caret: '#506070',
    gutterBackground: '#203040',
    activeLine: '#708090',
    visualGuide: '#A0B0C0',
    selectionMatch: '#E0B0C0',
    searchMatch: '#B0C0D0',
    searchMatchSelected: '#C0D0E0',
    searchMatchSelectedBorder: '#D0E0F0',
    completionSelected: '#E0F0A0',
    tokens: {
      keyword: { color: '#A0B0C0', bold: true, strikethrough: true },
      comment: { color: '#D0E0F0', italic: true, underline: true },
    },
  },
}));

// Replaces the editor's colors with test colors, since a test cannot add a theme to the bundled ones.
vi.mock('@/themes/themes', async (original) => {
  const actual = await original<typeof import('@/themes/themes')>();
  return {
    ...actual,
    useTheme: () => {
      const elsewise = actual.resolveTheme(actual.THEMES, { source: 'elsewise', name: 'elsewise' }, 'light');
      return { ...elsewise, editor: { ...elsewise.editor, ...EDITOR } };
    },
  };
});

const SETTINGS: Settings = {
  appearance: {
    ...DEFAULT_SETTINGS.appearance,
    general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light' },
  },
};

function shell(children: ReactNode) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, SETTINGS);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// A probe mounts an editor with whatever `useThemeExtension` resolves.
function mount(doc: string, extensions: Extension[]): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  function Probe() {
    const themeExtension = useThemeExtension();
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const view = new EditorView({
        state: EditorState.create({ doc, extensions: [themeExtension, ...extensions] }),
        parent: host.current as HTMLDivElement,
      });
      resolve(view);
      return () => view.destroy();
    }, [themeExtension]);
    return <div ref={host} />;
  }
  render(shell(<Probe />));
  return ready;
}

function style(el: Element | null): CSSStyleDeclaration {
  if (el === null) {
    throw new Error('missing element');
  }
  return getComputedStyle(el);
}

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

test("the visual guide takes the theme's color", async () => {
  const view = await mount('x', [visualGuides([1])]);
  await new Promise(requestAnimationFrame);
  expect(style(view.dom.querySelector('.cm-visual-guide')).borderLeftColor).toBe(rgb(EDITOR.visualGuide));
});

test("deprecated code is struck through at the font's strikeout position", async () => {
  const view = await mount('let x', []);
  view.dispatch(
    setDiagnostics(view.state, [
      { from: 0, to: 3, severity: 'hint', markClass: 'cm-lintRange-deprecated', message: 'deprecated' },
    ]),
  );
  const mark = style(view.dom.querySelector('.cm-lintRange-deprecated'));
  const size = Number.parseFloat(mark.fontSize);
  // JetBrains Mono's ascent is 1.02em, and its strikeout 0.05em thick, 0.32em above the baseline.
  expect(Number.parseFloat(mark.backgroundPositionY)).toBeCloseTo(Math.round(1.02 * size) - 0.32 * size);
  expect(Number.parseFloat(mark.backgroundSize.split(' ')[1])).toBeCloseTo(0.05 * size);
  expect(mark.textDecorationLine).toBe('none');
});

test('deprecated code is struck through by Chrome in a font whose strikeout is unknown', async () => {
  document.documentElement.style.setProperty('--font-mono', 'Menlo, monospace');
  onTestFinished(() => {
    document.documentElement.style.removeProperty('--font-mono');
  });
  const view = await mount('let x', []);
  view.dispatch(
    setDiagnostics(view.state, [
      { from: 0, to: 3, severity: 'hint', markClass: 'cm-lintRange-deprecated', message: 'deprecated' },
    ]),
  );
  const mark = style(view.dom.querySelector('.cm-lintRange-deprecated'));
  expect(mark.textDecorationLine).toBe('line-through');
  expect(mark.backgroundImage).toBe('none');
});

test('a selected completion keeps the text color, and the list shows whole rows', async () => {
  const options = Array.from({ length: 20 }, (_, i) => ({ label: `option${i}` }));
  const view = await mount('', [autocompletion({ override: [() => ({ from: 0, options })] })]);
  startCompletion(view);
  const selected = await vi.waitFor(() => {
    const selected = view.dom.querySelector('.cm-tooltip-autocomplete li[aria-selected]');
    expect(selected).not.toBeNull();
    return selected;
  });
  const tooltip = view.dom.querySelector('.cm-tooltip-autocomplete');
  expect(style(selected).color).toBe(style(tooltip).color);
  expect(style(selected).color).not.toBe('rgb(255, 255, 255)');
  expect(style(tooltip).borderStyle).toBe('none');
  const list = style(tooltip?.querySelector('ul') ?? null);
  expect(Number.parseFloat(list.maxHeight)).toBe(10 * 22 + 8);
  expect(style(selected).cursor).toBe('default');
});

test('signatures are parted by dividers, and wrap with a hanging indent', async () => {
  const dom = document.createElement('div');
  dom.className = 'cm-lsp-signatures';
  dom.innerHTML = '<ul><li>fn send()</li><li>fn send(bytes: Bytes)</li></ul>';
  await mount('send(', [showTooltip.of({ pos: 5, above: true, create: () => ({ dom }) })]);
  const [first, second] = dom.querySelectorAll('li');

  expect(style(first).borderTopWidth).toBe('0px');
  expect(style(second).borderTopWidth).toBe('1px');
  expect(Number.parseFloat(style(first).textIndent)).toBeLessThan(0);
  expect(style(dom).borderStyle).toBe('none');
});

test('the usages of the symbol at the caret, writes included, take the selection match color', async () => {
  const view = await mount('total + total', [
    EditorView.decorations.of(
      Decoration.set([
        Decoration.mark({ class: 'cm-lsp-highlight cm-lsp-highlight-write' }).range(0, 5),
        Decoration.mark({ class: 'cm-lsp-highlight' }).range(8, 13),
      ]),
    ),
  ]);
  const [write, read] = [...view.dom.querySelectorAll('.cm-lsp-highlight')].map((mark) => style(mark));

  expect(read.backgroundColor).toBe(rgb(EDITOR.selectionMatch));
  expect(write.backgroundColor).toBe(rgb(EDITOR.selectionMatch));
});

test('a symbol being renamed, and its occurrences, take the search match colors', async () => {
  const view = await mount('total + total', [
    EditorView.decorations.of(
      Decoration.set([
        Decoration.mark({ class: 'cm-lsp-rename-field' }).range(0, 5),
        Decoration.mark({ class: 'cm-lsp-rename-occurrence' }).range(8, 13),
      ]),
    ),
  ]);
  const field = style(view.dom.querySelector('.cm-lsp-rename-field'));

  expect(field.backgroundColor).toBe(rgb(EDITOR.searchMatchSelected));
  expect(field.outlineColor).toBe(rgb(EDITOR.searchMatchSelectedBorder));
  expect(field.outlineWidth).toBe('1px');
  expect(style(view.dom.querySelector('.cm-lsp-rename-occurrence')).backgroundColor).toBe(rgb(EDITOR.searchMatch));
});

test("only the keys of the rename hint are muted, like completion's", async () => {
  const hint = document.createElement('div');
  hint.className = 'cm-lsp-rename-hint';
  hint.innerHTML = '<kbd>↩</kbd> rename';
  await mount('total', [showTooltip.of({ pos: 0, create: () => ({ dom: hint }) })]);
  const text3 = rgb(getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim());

  expect(style(hint.querySelector('kbd')).color).toBe(text3);
  expect(style(hint).color).not.toBe(text3);
  expect(style(hint).borderTopWidth).toBe('0px');
});

test('usages are listed like completions, with each usage taking the search match color', async () => {
  const popup = document.createElement('div');
  popup.className = 'cm-lsp-references';
  const rows = Array.from(
    { length: 12 },
    (_, i) =>
      `<li class="cm-lsp-reference"><span class="cm-lsp-reference-preview">let <mark class="cm-lsp-reference-match">total</mark> = ${i};</span><span class="cm-lsp-reference-location">main.rs<span class="cm-lsp-reference-line">${i + 1}</span></span></li>`,
  );
  popup.innerHTML = `<div class="cm-lsp-references-header">Usages of <code>total</code></div><ul class="cm-lsp-references-list">${rows.join('')}</ul><div class="cm-lsp-references-hint"><kbd>↩</kbd> open</div>`;
  popup.querySelector('li')?.setAttribute('aria-selected', 'true');
  await mount('total', [showTooltip.of({ pos: 0, create: () => ({ dom: popup }) })]);
  const text3 = rgb(getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim());
  const list = popup.querySelector('ul') as HTMLElement;

  expect(style(popup.querySelector('[aria-selected]')).backgroundColor).toBe(rgb(EDITOR.completionSelected));
  expect(style(popup.querySelector('mark')).backgroundColor).toBe(rgb(EDITOR.searchMatch));
  expect(style(popup.querySelector('.cm-lsp-reference-location')).color).toBe(text3);
  expect(style(popup.querySelector('.cm-lsp-references-hint kbd')).color).toBe(text3);
  expect(style(popup.querySelector('.cm-lsp-references-hint')).color).not.toBe(text3);
  expect(style(popup.querySelector('.cm-lsp-reference')).cursor).toBe('default');
  expect(list.clientHeight).toBe(10 * 22 + 8);
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
});
