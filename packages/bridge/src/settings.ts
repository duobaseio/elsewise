import * as z from 'zod';
import { PluginId } from './plugins.js';

export type Settings = z.infer<typeof Settings>;
export type Brightness = z.infer<typeof Brightness>;
export type ThemeId = z.infer<typeof ThemeId>;
export type BundledTheme = z.infer<typeof BundledTheme>;
export type Font = z.infer<typeof Font>;
export type FontSize = z.infer<typeof FontSize>;
export type EditorLanguageSettings = z.infer<typeof EditorLanguageSettings>;
export type LineSeparator = z.infer<typeof LineSeparator>;
export type CursorStyle = z.infer<typeof CursorStyle>;

/**
 * The allowed font sizes.
 */
export const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] as const;

/**
 * The persisted application and plugins' settings.
 */
export interface SettingsBridge {
  /**
   * Returns the persisted application's settings.
   *
   * Missing and invalid values are replaced with their defaults.
   */
  load(): Promise<Settings>;

  /**
   * Saves the application's settings.
   *
   * Missing and invalid values are replaced with their defaults. Throws an error if `settings` or one of its sections
   * is not an object.
   */
  save(settings: Settings): Promise<void>;

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
   * Registers a `listener` that is called when the user opens the settings from the embedder, e.g. its menu bar.
   *
   * Returns a function that unregisters the `listener`.
   */
  onOpen(listener: () => void): () => void;
}

/**
 * The application's settings.
 *
 * A missing or invalid value is replaced with its default, and an unknown key is dropped.
 */
export const Settings = z.lazy(() =>
  z.object({
    appearance: z.preprocess(
      (section) => section ?? {},
      z.object({
        general: z.preprocess(
          (section) => section ?? {},
          z.object({
            brightness: Brightness.catch('system'),
            /**
             * The interface's theme.
             */
            theme: ThemeId.catch({ source: 'elsewise', name: 'elsewise' }),
            font: font(13),
            /**
             * Whether the file tree shows a git status's letter, e.g. `M`.
             */
            gitStatusBadges: z.boolean().catch(true),
          }),
        ),
        editor: z.preprocess(
          (section) => section ?? {},
          z.object({
            tabSize: EditorLanguageSettings.shape.tabSize.catch(4),
            indentUnit: EditorLanguageSettings.shape.indentUnit.catch('  '),
            lineSeparator: EditorLanguageSettings.shape.lineSeparator.catch(null),
            visualGuides: EditorLanguageSettings.shape.visualGuides.catch([120]),
            /**
             * The editor's theme, or `null` to follow the interface's.
             */
            theme: ThemeId.nullable().catch(null),
            font: font(12),
            lineNumbers: z.boolean().catch(true),
            lineWrapping: z.boolean().catch(false),
            /**
             * Whether completions show the selected item's documentation beside the list.
             */
            completionDocumentation: z.boolean().catch(true),
            /**
             * Overrides by language, keyed by CodeMirror's name for it, e.g. `TypeScript`.
             *
             * An override keeps the leaves it got right and drops the rest, rather than falling back to a default.
             */
            languages: z
              .record(
                z.string(),
                z
                  .object({
                    tabSize: EditorLanguageSettings.shape.tabSize.optional().catch(undefined),
                    indentUnit: EditorLanguageSettings.shape.indentUnit.optional().catch(undefined),
                    lineSeparator: EditorLanguageSettings.shape.lineSeparator.optional().catch(undefined),
                    visualGuides: EditorLanguageSettings.shape.visualGuides.optional().catch(undefined),
                  })
                  // A caught leaf is left behind as `undefined`, which would override the editor's own value when spread.
                  .transform(
                    (override) =>
                      Object.fromEntries(
                        Object.entries(override).filter(([, value]) => value !== undefined),
                      ) as Partial<EditorLanguageSettings>,
                  )
                  .catch({}),
              )
              .catch({}),
          }),
        ),
        terminal: z.preprocess(
          (section) => section ?? {},
          z.object({
            /**
             * The terminal's theme, or `null` to follow the interface's.
             */
            theme: ThemeId.nullable().catch(null),
            font: font(12),
            cursorStyle: CursorStyle.catch('block'),
            cursorBlink: z.boolean().catch(true),
            /**
             * The number of lines kept above the screen.
             */
            scrollback: z.int().min(1000).max(100000).catch(10000),
          }),
        ),
      }),
    ),
  }),
);

/**
 * A theme and where it comes from:
 *
 * - `elsewise`: bundled with Elsewise.
 * - `plugin`: provided by the plugin whose id is `plugin`.
 */
export const ThemeId = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('elsewise'), name: z.lazy(() => BundledTheme) }),
  z.strictObject({ source: z.literal('plugin'), plugin: PluginId, name: z.string().min(1) }),
]);

/**
 * Elsewise's bundled themes.
 */
export const BundledTheme = z.enum([
  'catppuccin-frappe',
  'catppuccin-latte',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dracula',
  'elsewise',
  'solarized',
  'tokyo-night',
]);

export const Brightness = z.enum(['light', 'dark', 'system']);

export const FontSize = z.literal(FONT_SIZES);

export const Font = z.object({
  /**
   * A font family, or `null` for the default.
   */
  family: z.string().min(1).nullable(),
  size: FontSize,
  ligatures: z.boolean(),
});

function font(size: FontSize) {
  const font = z.object({
    family: Font.shape.family.catch(null),
    size: FontSize.catch(size),
    ligatures: Font.shape.ligatures.catch(true),
  });
  return font.catch(() => font.parse({}));
}

export const LineSeparator = z.enum(['\n', '\r\n']);

export const EditorLanguageSettings = z.object({
  tabSize: z.int().min(1),
  /**
   * The whitespace inserted per indent level, e.g. two spaces or `\t`.
   */
  indentUnit: z.string().regex(/^(?: +|\t)$/),
  /**
   * The line separator for saved files, or `null` to keep each file's own.
   */
  lineSeparator: LineSeparator.nullable(),
  /**
   * The columns to draw a vertical guide at, e.g. `[80, 120]`.
   */
  visualGuides: z.array(z.int().min(1).max(500)),
});

export const CursorStyle = z.enum(['block', 'underline', 'bar']);

/**
 * The settings a missing or invalid value is replaced with.
 */
export const DEFAULT_SETTINGS: Settings = Settings.parse({});

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
