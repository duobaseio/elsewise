import type { SettingsPanel, SettingsSearchTerm } from '@elsewise/plugin';
import { describe, expect, test } from 'vitest';
import { type SettingsSearchHit, search } from './search';

// Returns a panel with `id` and `terms`.
function panel(id: string, terms: Record<string, SettingsSearchTerm>): SettingsPanel {
  return { id, label: id, terms, component: () => null };
}

const PANELS = [
  panel('general', {
    brightness: { label: 'Brightness', keywords: ['theme', 'dark mode', 'light', 'dark'] },
    font: { label: 'Font', keywords: ['font family', 'typeface', 'ligatures'] },
  }),
  panel('editor', {
    theme: { label: 'Theme', keywords: ['colors', 'syntax highlighting'] },
    tabSize: { label: 'Tab width', keywords: ['tab size', 'columns', 'indentation'] },
    indentUnit: { label: 'Indent with', keywords: ['tabs', 'spaces', 'indentation'] },
    font: { label: 'Font', keywords: ['font family', 'monospace'] },
  }),
  panel('terminal', {
    scrollback: { label: 'Scrollback', keywords: ['history', 'lines', 'buffer'] },
  }),
];

const ids = (hits: readonly SettingsSearchHit[]) => hits.map((hit) => `${hit.panel.id}.${hit.id}`);

describe('search', () => {
  test('finds nothing for blank query', () => {
    expect(search('', PANELS)).toEqual([]);
    expect(search('   \t ', PANELS)).toEqual([]);
  });

  test('ignores case', () => {
    expect(ids(search('FONT', PANELS))).toEqual(['general.font', 'editor.font']);
    expect(search('FONT', PANELS)).toEqual(search('font', PANELS));
  });

  test('matches prefix, not substring', () => {
    expect(search('dent', PANELS)).toEqual([]);
    expect(ids(search('ind', PANELS))).toEqual(['editor.indentUnit', 'editor.tabSize']);
  });

  test('requires every word', () => {
    // 'indent' hits tabSize's keywords and indentUnit's label, 'tab' the other way round.
    expect(ids(search('indent tab', PANELS))).toContain('editor.tabSize');
    expect(search('indent colour', PANELS)).toEqual([]);
  });

  test('ranks label over keyword', () => {
    expect(ids(search('the', PANELS))).toEqual(['editor.theme', 'general.brightness']);
  });

  test('keeps panel then term order on ties', () => {
    // Both score 3, label and keyword each way, so tabSize stays ahead as it is declared first.
    expect(ids(search('indent tab', PANELS))).toEqual(['editor.tabSize', 'editor.indentUnit']);
    expect(ids(search('font', PANELS))).toEqual(['general.font', 'editor.font']);
  });

  test('returns term and panel of hit', () => {
    const [hit] = search('history', PANELS);

    expect(hit?.panel).toBe(PANELS[2]);
    expect(hit?.id).toBe('scrollback');
    expect(hit?.term.label).toBe('Scrollback');
  });
});
