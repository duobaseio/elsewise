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
   * Throws an error if the `settings` is invalid.
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

/** The application's settings. */
export interface Settings {
  appearance: {
    general: {
      brightness: Brightness;
      font: Font;
      /** Whether the file tree shows a git status's letter, e.g. `M`. */
      gitStatusBadges: boolean;
    };
    editor: EditorLanguageSettings & {
      theme: string;
      font: Font;
      lineNumbers: boolean;
      lineWrapping: boolean;
      /** Overrides by language, keyed by CodeMirror's name for it, e.g. `TypeScript`. */
      languages: Record<string, Partial<EditorLanguageSettings>>;
    };
    terminal: {
      theme: string;
      font: Font;
      cursorStyle: CursorStyle;
      cursorBlink: boolean;
      /** The number of lines kept above the screen. */
      scrollback: number;
    };
  };
}

/** Light or dark mode. `system` follows the operating system. */
export type Brightness = 'light' | 'dark' | 'system';

export interface Font {
  /** A font family, or `null` for the default. */
  family: string | null;
  size: FontSize;
  ligatures: boolean;
}

/** The allowed font sizes. */
export const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] as const;

export type FontSize = (typeof FONT_SIZES)[number];

export interface EditorLanguageSettings {
  tabSize: number;
  /** The whitespace inserted per indent level, e.g. two spaces or `\t`. */
  indentUnit: string;
  /** The line separator for saved files, or `null` to keep each file's own. */
  lineSeparator: LineSeparator | null;
  /** The columns to draw a vertical guide at, e.g. `[80, 120]`. */
  visualGuides: number[];
}

export type LineSeparator = '\n' | '\r\n';

export type CursorStyle = 'block' | 'underline' | 'bar';

/** `T` if it survives a JSON round trip, otherwise a type `T` fails to match. */
export type Json<T> = T extends string | number | boolean | null
  ? T
  : T extends readonly (infer U)[]
    ? readonly Json<U>[]
    : T extends object
      ? T extends (...args: never[]) => unknown
        ? never
        : { [K in keyof T]: Json<T[K]> }
      : never;
