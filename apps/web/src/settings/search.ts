import type { SettingsPanel, SettingsSearchTerm } from '@elsewise/plugin';

export interface SettingsSearchHit {
  readonly id: string;
  readonly panel: SettingsPanel;
  readonly term: SettingsSearchTerm;
}

/**
 * Returns the settings that best match.
 *
 * Every word in a query has to be a prefix of a word in a setting's label or its keywords. Labels take precedence over
 * keywords.
 */
export function search(query: string, panels: readonly SettingsPanel[]): SettingsSearchHit[] {
  const words = split(query);
  if (words.length === 0) {
    return [];
  }

  const hits: { hit: SettingsSearchHit; score: number }[] = [];
  for (const panel of panels) {
    for (const [id, term] of Object.entries(panel.terms)) {
      const label = split(term.label);
      const keywords = term.keywords.flatMap(split);

      let score = 0;
      for (const word of words) {
        if (label.some((part) => part.startsWith(word))) {
          score += 2;
        } else if (keywords.some((part) => part.startsWith(word))) {
          score += 1;
        } else {
          score = 0;
          break;
        }
      }

      if (score > 0) {
        hits.push({ hit: { id, panel, term }, score });
      }
    }
  }

  return hits.sort((a, b) => b.score - a.score).map(({ hit }) => hit);
}

function split(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
}
