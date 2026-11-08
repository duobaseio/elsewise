import { PluginId } from '@elsewise/plugin';
import * as z from 'zod';

export type FrontendSettings = DeepReadonly<z.infer<typeof FrontendSettings>>;
export type Brightness = z.infer<typeof Brightness>;
export type ThemeId = DeepReadonly<z.infer<typeof ThemeId>>;
export type BundledTheme = z.infer<typeof BundledTheme>;
export type Font = DeepReadonly<z.infer<typeof Font>>;
export type FontSize = z.infer<typeof FontSize>;
export type LineHeight = z.infer<typeof LineHeight>;
export type EditorLanguageSettings = DeepReadonly<z.infer<typeof EditorLanguageSettings>>;
export type LineSeparator = z.infer<typeof LineSeparator>;
export type DiffLayout = z.infer<typeof DiffLayout>;
export type CursorStyle = z.infer<typeof CursorStyle>;
export type KeymapId = DeepReadonly<z.infer<typeof KeymapId>>;
export type BundledKeymap = z.infer<typeof BundledKeymap>;

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/**
 * The allowed font sizes.
 */
export const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] as const;

/**
 * The CodeMirror names of the default languages.
 */
export const DEFAULT_LANGUAGES = [
  'C',
  'C#',
  'C++',
  'CSS',
  'Dart',
  'Go',
  'HTML',
  'Java',
  'JavaScript',
  'JSON',
  'Kotlin',
  'Markdown',
  'Objective-C',
  'PHP',
  'ProtoBuf',
  'Python',
  'Ruby',
  'Rust',
  'SQL',
  'Swift',
  'TOML',
  'TypeScript',
  'XML',
  'YAML',
] as const;

/**
 * The frontend's settings.
 *
 * A missing or invalid value is replaced with its default while unknown keys are dropped.
 */
export const FrontendSettings = z.lazy(() =>
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
            theme: ThemeId.catch({ source: 'elsewise', id: 'elsewise' }),
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
            font: font(12, 1.54),
            lineNumbers: z.boolean().catch(true),
            lineWrapping: z.boolean().catch(false),
            /**
             * Whether completions show the selected item's documentation beside the list.
             */
            completionDocumentation: z.boolean().catch(true),
            /**
             * Whether resting the caret on a symbol highlights its usages in the file.
             */
            highlightUsages: z.boolean().catch(true),
            /**
             * Whether to show markers over the scrollbar.
             */
            scrollbarMarkers: z.boolean().catch(true),
            /**
             * The default layout when viewing a diff.
             */
            diffLayout: DiffLayout.catch('split'),
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
              .catch(Object.fromEntries(DEFAULT_LANGUAGES.map((language) => [language, {}]))),
          }),
        ),
        terminal: z.preprocess(
          (section) => section ?? {},
          z.object({
            /**
             * The terminal's theme, or `null` to follow the interface's.
             */
            theme: ThemeId.nullable().catch(null),
            font: font(12, 1.0625),
            cursorStyle: CursorStyle.catch('block'),
            cursorBlink: z.boolean().catch(true),
            copyOnSelect: z.boolean().catch(false),
            /**
             * Whether Option-click selects text on macOS while a program tracks the mouse, e.g. tmux, instead of sending
             * the click to it.
             */
            macOptionClickForcesSelection: z.boolean().catch(false),
            /**
             * Whether Option represents Meta on macOS instead of typing special characters.
             */
            macOptionIsMeta: z.boolean().catch(false),
            /**
             * The number of lines kept above the screen.
             */
            scrollback: z.int().min(1000).max(100000).catch(10000),
          }),
        ),
      }),
    ),
    /**
     * The current keymap.
     */
    keymap: KeymapId.catch({ source: 'elsewise', id: 'elsewise' }),
  }),
);

/**
 * A theme and where it comes from:
 *
 * - `elsewise`: bundled with Elsewise.
 * - `user`: created by the user, e.g. by changing a bundled or plugin theme.
 * - `plugin`: provided by the plugin whose id is `plugin`.
 */
export const ThemeId = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('elsewise'), id: z.lazy(() => BundledTheme) }),
  z.strictObject({ source: z.literal('user'), id: z.string().min(1) }),
  z.strictObject({ source: z.literal('plugin'), plugin: PluginId, id: z.string().min(1) }),
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

/**
 * A multiple of the font size in the editor, and of the glyph height in the terminal.
 */
export const LineHeight = z.number().min(1).max(2.5);

export const Font = z.object({
  /**
   * A font family, or `null` for the default.
   */
  family: z.string().min(1).nullable(),
  size: FontSize,
  lineHeight: LineHeight.optional(),
  ligatures: z.boolean(),
});

function font(size: FontSize): z.ZodType<Omit<Font, 'lineHeight'>>;
function font(size: FontSize, lineHeight: LineHeight): z.ZodType<Required<Font>>;
function font(size: FontSize, lineHeight?: LineHeight): z.ZodType {
  const font = z.object({
    family: Font.shape.family.catch(null),
    size: FontSize.catch(size),
    ...(lineHeight === undefined ? {} : { lineHeight: LineHeight.catch(lineHeight) }),
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

export const DiffLayout = z.enum(['unified', 'split']);

export const CursorStyle = z.enum(['block', 'underline', 'bar']);

/**
 * A keymap and where it comes from:
 *
 * - `elsewise`: bundled with Elsewise.
 * - `user`: created by the user, e.g. by changing a bundled or plugin keymap.
 * - `plugin`: provided by the plugin whose id is `plugin`.
 */
export const KeymapId = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('elsewise'), id: z.lazy(() => BundledKeymap) }),
  z.strictObject({ source: z.literal('user'), id: z.string().min(1) }),
  z.strictObject({ source: z.literal('plugin'), plugin: PluginId, id: z.string().min(1) }),
]);

/**
 * Elsewise's bundled keymaps.
 */
export const BundledKeymap = z.enum(['elsewise']);

/**
 * The settings a missing or invalid value is replaced with.
 */
export const DEFAULT_FRONTEND_SETTINGS: FrontendSettings = FrontendSettings.parse({});
