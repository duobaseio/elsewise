import type { FrontendSettings, Keymap, Theme } from '@elsewise/frontend-plugin';

/**
 * The persisted application and plugins' settings.
 */
export interface SettingsBridge {
  /**
   * Returns the persisted application's settings.
   *
   * Missing and invalid values are replaced with their defaults.
   */
  load(): Promise<FrontendSettings>;

  /**
   * Saves the application's settings.
   *
   * Missing and invalid values are replaced with their defaults. Throws an error if `settings` or one of its sections
   * is not an object.
   */
  save(settings: FrontendSettings): Promise<void>;

  /**
   * Returns the settings for a given plugin's id, or `undefined` if the plugin does not exist or does not have any settings.
   */
  loadPlugin(plugin: string): Promise<unknown>;

  /**
   * Saves the settings for a given plugin's id.
   *
   * Throws an error if `value` is not JSON-serializable.
   */
  savePlugin<T>(plugin: string, value: T & Json<T>): Promise<void>;

  /**
   * Returns the user's themes in `<config folder>/themes`, each identified by its file name without `.json`, or with why
   * it could not be read.
   */
  loadUserThemes(): Promise<({ id: string; theme: Theme } | { id: string; error: string })[]>;

  /**
   * Saves the user's theme with `id`, replacing any existing one.
   *
   * Throws an error if `id` is invalid or `theme` is malformed.
   */
  saveUserTheme(id: string, theme: Theme): Promise<void>;

  /**
   * Deletes the user's theme with `id`, if any.
   *
   * Throws an error if `id` is invalid.
   */
  deleteUserTheme(id: string): Promise<void>;

  /**
   * Returns the user's keymaps in `<config folder>/keymaps`, each identified by its file name without `.json`, or with
   * why it could not be read.
   */
  loadUserKeymaps(): Promise<({ id: string; keymap: Keymap } | { id: string; error: string })[]>;

  /**
   * Saves the user's keymap with `id`, replacing any existing one.
   *
   * Throws an error if `id` is invalid or `keymap` is malformed.
   */
  saveUserKeymap(id: string, keymap: Keymap): Promise<void>;

  /**
   * Deletes the user's keymap with `id`, if any.
   *
   * Throws an error if `id` is invalid.
   */
  deleteUserKeymap(id: string): Promise<void>;

  /**
   * Calls `handler` when the user's themes or keymaps change on disk.
   */
  onChange(handler: (changed: 'themes' | 'keymaps') => void): void;
}

/**
 * `T` if it survives a JSON round trip, otherwise a type `T` fails to match.
 */
export type Json<T> = T extends string | number | boolean | null
  ? T
  : T extends readonly (infer U)[]
    ? readonly Json<U>[]
    : T extends object
      ? T extends (...args: never[]) => unknown
        ? never
        : { [K in keyof T]: Json<T[K]> }
      : never;
