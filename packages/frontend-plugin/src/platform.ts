/**
 * The underlying platform that hosts the frontend.
 */
export interface Platform {
  /**
   * Shows `absolutePath` in the platform's file manager.
   *
   * Throws if `absolutePath` does not exist or cannot be opened, e.g. no permission.
   */
  showPath(absolutePath: string): Promise<void>;

  /**
   * Prompts the user to pick files or folders, and returns their absolute paths, or none if they cancel. Links in the
   * paths are resolved unless `resolveAliases` is false.
   */
  pickPaths(options?: PickPathsOptions): Promise<string[]>;
}

/**
 * A kind of file a picker offers, e.g. `{ name: 'Themes', extensions: ['json'] }`. Extensions go without the dot.
 */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * What a picker offers, and how.
 */
export interface PickPathsOptions {
  /**
   * What the user picks, `file` by default. Only macOS offers `fileOrFolder`; other platforms pick a folder.
   */
  kind?: 'file' | 'folder' | 'fileOrFolder';
  title?: string;
  /**
   * The folder or file the picker starts at, as an absolute path, or a file name.
   */
  defaultPath?: string;
  /**
   * The confirm button's label.
   */
  buttonLabel?: string;
  /**
   * The kinds of file the picker offers.
   */
  filters?: FileFilter[];
  /**
   * A message above the picker. macOS only.
   */
  message?: string;
  /**
   * Whether the user can pick more than one.
   */
  multiple?: boolean;
  /**
   * Whether hidden files are shown.
   */
  showHidden?: boolean;
  /**
   * Whether the user can create a folder. macOS only; other platforms always allow it.
   */
  createFolder?: boolean;
  /**
   * Whether the user can enter a path that does not exist yet. Windows only.
   */
  promptToCreate?: boolean;
  /**
   * Whether picked aliases and links resolve to their targets, `true` by default.
   */
  resolveAliases?: boolean;
  /**
   * Whether packages, e.g. `.app`, open as folders. macOS only.
   */
  openPackages?: boolean;
  /**
   * Whether a picked path is added to the recent documents, `true` by default. Windows only.
   */
  addToRecent?: boolean;
}
