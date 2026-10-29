import type { EditorLanguageSettings } from '@elsewise/bridge';
import type { SettingsPanel, SettingsSearchTerm } from '@elsewise/plugin';
import { DEFAULT_PANELS } from '@/settings/default-panels';
import { LANGUAGES } from '@/settings/languages';

export interface SettingsSearchHit {
  readonly id: string;
  readonly panel: SettingsPanel;
  readonly term: SettingsSearchTerm;
  readonly language?: string;
}

const LANGUAGE_KEYS: readonly (keyof EditorLanguageSettings)[] = [
  'tabSize',
  'indentUnit',
  'lineSeparator',
  'visualGuides',
];

/**
 * Returns the settings that best match.
 *
 * Every word in a query has to be a prefix of a word in a setting's label or its keywords. Labels take precedence over
 * keywords. A language in `languages` is searched when the query contains the language name.
 */
export function search(
  query: string,
  panels: readonly SettingsPanel[],
  languages: readonly string[] = [],
): SettingsSearchHit[] {
  const words = split(query);
  if (words.length === 0) {
    return [];
  }

  const candidates: SettingsSearchHit[] = panels.flatMap((panel) =>
    Object.entries(panel.terms).map(([id, term]) => ({ id, panel, term })),
  );
  const editor = panels.find((panel) => panel.id === DEFAULT_PANELS.editor.id);
  if (editor !== undefined) {
    for (const language of languages) {
      const label = split(LANGUAGES[language]?.label ?? language);
      if (words.some((word) => label.some((part) => part.startsWith(word)))) {
        for (const id of LANGUAGE_KEYS) {
          const term = editor.terms[id];
          if (term !== undefined) {
            candidates.push({ id, panel: editor, term: { ...term, keywords: [...label, ...term.keywords] }, language });
          }
        }
      }
    }
  }

  const hits: { hit: SettingsSearchHit; score: number }[] = [];
  for (const hit of candidates) {
    const label = split(hit.term.label);
    const keywords = hit.term.keywords.flatMap(split);

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
      hits.push({ hit, score });
    }
  }

  return hits.sort((a, b) => b.score - a.score).map(({ hit }) => hit);
}

// Words, with a language's label, e.g. `JavaScript/JSX`, split by its parts.
function split(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s/]+/)
    .filter((word) => word !== '');
}
