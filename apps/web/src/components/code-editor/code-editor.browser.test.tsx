import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view';
import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef } from 'react';
import { beforeAll, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CodeEditor } from '@/components/code-editor/code-editor';
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
    searchMatch: '#A1B2C3',
    searchMatchSelected: '#00000000',
    searchMatchSelectedBorder: '#C3B2A1',
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
    editor: { ...DEFAULT_SETTINGS.appearance.editor, visualGuides: [] },
  },
};

let rust: LanguageSupport;

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

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

async function mountEditor(code: string): Promise<EditorView> {
  const screen = await render(
    shell(
      <div style={{ height: 300 }}>
        <CodeEditor code={code} path="main.rs" />
      </div>,
    ),
  );
  await expect.element(screen.getByText(code.split('\n')[0])).toBeVisible();
  const view = EditorView.findFromDOM(screen.container.querySelector('.cm-editor') as HTMLElement);
  if (view === null) {
    throw new Error('missing editor');
  }
  return view;
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

test("the theme's colors and token styles land", async () => {
  const view = await mount('// note\nfn main() {}\n', [
    drawSelection(),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    rust,
  ]);
  view.focus();
  // drawSelection paints the caret on the next frame.
  await new Promise(requestAnimationFrame);
  expect(style(view.dom).backgroundColor).toBe(rgb(EDITOR.background));
  expect(style(view.dom).color).toBe(rgb(EDITOR.foreground));
  expect(style(view.dom.querySelector('.cm-cursor')).borderLeftColor).toBe(rgb(EDITOR.caret));
  expect(style(view.dom.querySelector('.cm-gutters')).backgroundColor).toBe(rgb(EDITOR.gutterBackground));
  expect(style(view.dom.querySelector('.cm-activeLine')).backgroundColor).toBe(rgb(EDITOR.activeLine));
  expect(style(view.dom.querySelector('.cm-activeLineGutter')).backgroundColor).toBe(rgb(EDITOR.activeLine));

  const spans = [...view.dom.querySelectorAll('.cm-line span')];
  const keyword = style(spans.find((span) => span.textContent === 'fn') ?? null);
  const comment = style(spans.find((span) => span.textContent === '// note') ?? null);
  expect(keyword.color).toBe(rgb(EDITOR.tokens.keyword.color));
  expect(keyword.fontWeight).toBe('700');
  expect(keyword.textDecorationLine).toBe('line-through');
  expect(comment.color).toBe(rgb(EDITOR.tokens.comment.color));
  expect(comment.fontStyle).toBe('italic');
  expect(comment.textDecorationLine).toBe('underline');
});

test("the visual guide takes the theme's color", async () => {
  const view = await mount('x', [visualGuides([1])]);
  await new Promise(requestAnimationFrame);
  expect(style(view.dom.querySelector('.cm-visual-guide')).borderLeftColor).toBe(rgb(EDITOR.visualGuide));
});

test('search match roles', async () => {
  const view = await mountEditor('a a a\n');
  openSearchPanel(view);
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'a' })) });
  findNext(view);

  const marks = [...view.dom.querySelectorAll('.cm-searchMatch')];
  expect(marks).toHaveLength(3);
  const current = style(view.dom.querySelector('.cm-searchMatch-selected'));
  const other = style(marks.find((mark) => !mark.classList.contains('cm-searchMatch-selected')) ?? null);
  expect(other.backgroundColor).toBe(rgb(EDITOR.searchMatch));
  expect(current.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(current.outlineColor).toBe(rgb(EDITOR.searchMatchSelectedBorder));
  expect(current.outlineStyle).toBe('solid');
  expect(current.outlineWidth).toBe('1px');
  expect(current.outlineOffset).toBe('-1px');
});

test('tooltips above the search bar', async () => {
  const view = await mountEditor('fn main() {}\n');
  openSearchPanel(view);
  await userEvent.hover(page.getByRole('button', { name: 'Next match' }));

  const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');
  await expect.poll(tooltip).not.toBeNull();
  const { left, top, width, height } = (tooltip() as Element).getBoundingClientRect();
  const hit = document.elementFromPoint(left + width / 2, top + height / 2);
  expect(tooltip()?.contains(hit)).toBe(true);
});

test('the fold marker is drawn from the icon set', async () => {
  const view = await mountEditor('fn main() {\n    let a = 1;\n}\n');
  await expect.poll(() => view.dom.querySelector('.cm-fold-marker')).not.toBeNull();
  expect(style(view.dom.querySelector('.cm-fold-marker')).maskImage).toMatch(/^url\("data:image\/svg\+xml,/);
});
