import type { ComponentType } from 'react';
import type { Disposable } from './plugin.ts';

/**
 * The ids of the settings sidebar's built-in groups.
 *
 * See {@link SettingsPanel.in}.
 */
export const DEFAULT_SETTINGS_GROUPS = {
  appearance: 'appearance',
} as const;

/**
 * The id of a settings sidebar group.
 */
export type SettingsGroup = (typeof DEFAULT_SETTINGS_GROUPS)[keyof typeof DEFAULT_SETTINGS_GROUPS];

/**
 * The settings.
 */
export interface Settings {
  /**
   * Adds `panels` to the settings sidebar.
   *
   * ```ts
   * settings.add([
   *   {
   *     id: 'io.example.words',
   *     label: 'Words',
   *     in: 'appearance',
   *     terms: { dictionary: { label: 'Dictionary', keywords: ['spelling', 'language'] } },
   *     component: Words,
   *   },
   * ]);
   * ```
   *
   * Returns a disposable that removes the `panels`.
   */
  add(panels: readonly SettingsPanel[]): Disposable;

  /**
   * Adds `previews` of languages to their editor settings, a later addition replacing an earlier one for the same
   * language.
   *
   * ```ts
   * settings.addLanguagePreviews([{ language: 'Dotenv', path: '.env', code: 'PORT=3000\n' }]);
   * ```
   *
   * Returns a disposable that removes the `previews`.
   */
  addLanguagePreviews(previews: readonly SettingsLanguagePreview[]): Disposable;
}

/**
 * A code snippet, shown in a language's editor settings.
 */
export interface SettingsLanguagePreview {
  /**
   * CodeMirror's name for the language, e.g. `Dotenv`.
   */
  readonly language: string;

  /**
   * The code snippet's path, which is matched to its language like a file's, e.g. `.env`.
   */
  readonly path: string;

  /**
   * The code snippet.
   */
  readonly code: string;
}

/**
 * A panel in the settings.
 */
export interface SettingsPanel {
  /**
   * The panel's id, namespaced by the plugin's, e.g. `io.example.words`. Omitted if the id already exists.
   */
  readonly id: string;

  /**
   * The id of the group or panel it is listed in. Omitted if the panel does not exist or is itself in a panel.
   *
   * See {@link DEFAULT_SETTINGS_GROUPS} for the groups.
   */
  readonly in: SettingsGroup | (string & {});

  /**
   * The panel's label in the sidebar.
   */
  readonly label: string;

  /**
   * The panel's search terms by the id of their row, which a search result scrolls to and highlights.
   */
  readonly terms: Readonly<Record<string, SettingsSearchTerm>>;

  /**
   * The panel, rendered inside Elsewise's React tree.
   */
  readonly component: ComponentType;
}

/**
 * What a setting is searched by.
 */
export interface SettingsSearchTerm {
  /**
   * The setting's label.
   */
  readonly label: string;

  /**
   * Synonyms, e.g. `['typeface', 'ui font']` for a font.
   */
  readonly keywords: readonly string[];
}
