import type { ComponentType } from 'react';
import type { Disposable } from './plugin.ts';

/**
 * The ids of the settings sidebar's built-in groups.
 *
 * See {@link SettingsPanel.group}.
 */
export const DEFAULT_SETTINGS_GROUPS = {
  appearance: 'appearance',
  plugins: 'plugins',
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
   *     terms: { dictionary: { label: 'Dictionary', keywords: ['spelling', 'language'] } },
   *     component: Words,
   *   },
   * ]);
   * ```
   *
   * Returns a disposable that removes the `panels`.
   */
  add(panels: readonly SettingsPanel[]): Disposable;
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
   * The sidebar group it is listed. Defaults to `plugins`.
   *
   * See {@link DEFAULT_SETTINGS_GROUPS}.
   */
  readonly group?: SettingsGroup;

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
