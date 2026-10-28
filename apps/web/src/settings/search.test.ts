import type { SettingsPanel, SettingsSearchTerm } from '@elsewise/plugin';
import { describe, expect, test } from 'vitest';
import { DEFAULT_PANELS } from './default-panels';
import { type SettingsSearchHit, search } from './search';

// Returns a panel with `id` and `terms`.
function panel(id: string, terms: Record<string, SettingsSearchTerm>): SettingsPanel {
  return { id, label: id, in: 'appearance', terms, component: () => null };
}

const PANELS = [
  panel('general', {
    brightness: { label: 'Brightness', keywords: ['theme', 'dark mode', 'light', 'dark'] },
    font: { label: 'Font', keywords: ['font family', 'typeface', 'ligatures'] },
  }),
  {
    ...panel('editor', {
      theme: { label: 'Theme', keywords: ['colors', 'syntax highlighting'] },
      tabSize: { label: 'Tab width', keywords: ['tab size', 'columns', 'indentation'] },
      indentUnit: { label: 'Indent with', keywords: ['tabs', 'spaces', 'indentation'] },
      lineSeparator: { label: 'Line endings', keywords: ['lf', 'crlf', 'eol'] },
      visualGuides: { label: 'Visual guides', keywords: ['rulers', 'column guides'] },
      font: { label: 'Font', keywords: ['font family', 'monospace'] },
    }),
    id: DEFAULT_PANELS.editor.id,
  },
  panel('terminal', {
    scrollback: { label: 'Scrollback', keywords: ['history', 'lines', 'buffer'] },
  }),
];

const ids = (hits: readonly SettingsSearchHit[]) =>
  hits.map((hit) => (hit.language === undefined ? `${hit.panel.id}.${hit.id}` : `${hit.language}.${hit.id}`));

describe('search', () => {
  test('finds nothing for blank query', () => {
    expect(search('', PANELS)).toEqual([]);
    expect(search('   \t ', PANELS)).toEqual([]);
  });

  test('ignores case', () => {
    expect(ids(search('FONT', PANELS))).toEqual(['general.font', `${DEFAULT_PANELS.editor.id}.font`]);
    expect(search('FONT', PANELS)).toEqual(search('font', PANELS));
  });

  test('matches prefix, not substring', () => {
    expect(search('dent', PANELS)).toEqual([]);
    expect(ids(search('ind', PANELS))).toEqual([
      `${DEFAULT_PANELS.editor.id}.indentUnit`,
      `${DEFAULT_PANELS.editor.id}.tabSize`,
    ]);
  });

  test('requires every word', () => {
    // 'indent' hits tabSize's keywords and indentUnit's label, 'tab' the other way round.
    expect(ids(search('indent tab', PANELS))).toContain(`${DEFAULT_PANELS.editor.id}.tabSize`);
    expect(search('indent colour', PANELS)).toEqual([]);
  });

  test('ranks label over keyword', () => {
    expect(ids(search('the', PANELS))).toEqual([`${DEFAULT_PANELS.editor.id}.theme`, 'general.brightness']);
  });

  test('keeps panel then term order on ties', () => {
    // Both score 3, label and keyword each way, so tabSize stays ahead as it is declared first.
    expect(ids(search('indent tab', PANELS))).toEqual([
      `${DEFAULT_PANELS.editor.id}.tabSize`,
      `${DEFAULT_PANELS.editor.id}.indentUnit`,
    ]);
    expect(ids(search('font', PANELS))).toEqual(['general.font', `${DEFAULT_PANELS.editor.id}.font`]);
  });

  test('returns term and panel of hit', () => {
    const [hit] = search('history', PANELS);

    expect(hit?.panel).toBe(PANELS[2]);
    expect(hit?.id).toBe('scrollback');
    expect(hit?.term.label).toBe('Scrollback');
  });

  test('searches language named by word, its settings only', () => {
    expect(ids(search('markdown guides', PANELS, ['Markdown', 'Rust']))).toEqual(['Markdown.visualGuides']);
    expect(ids(search('mark', PANELS, ['Markdown']))).toEqual([
      'Markdown.tabSize',
      'Markdown.indentUnit',
      'Markdown.lineSeparator',
      'Markdown.visualGuides',
    ]);
  });

  test('skips language no word names', () => {
    expect(ids(search('guides', PANELS, ['Markdown']))).toEqual([`${DEFAULT_PANELS.editor.id}.visualGuides`]);
  });

  test('names language by part of label', () => {
    expect(ids(search('jsx guides', PANELS, ['JavaScript']))).toEqual(['JavaScript.visualGuides']);
    expect(ids(search('javascript guides', PANELS, ['JavaScript']))).toEqual(['JavaScript.visualGuides']);
  });

  test('returns language and editor panel of language hit', () => {
    const [hit] = search('rust guides', PANELS, ['Rust']);

    expect(hit?.panel).toBe(PANELS[1]);
    expect(hit?.language).toBe('Rust');
    expect(hit?.id).toBe('visualGuides');
    expect(hit?.term.label).toBe('Visual guides');
  });

  test('skips languages without editor panel', () => {
    expect(search('markdown', [PANELS[0]], ['Markdown'])).toEqual([]);
  });
});
