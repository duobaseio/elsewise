/**
 * The underlying platform that hosts the frontend.
 */
export interface Platform {
  /**
   * Opens the folder at `absolutePath` in the platform's file manager.
   *
   * Throws if `absolutePath` is not a directory or cannot be opened, e.g. no permission.
   */
  openFolder(absolutePath: string): Promise<void>;

  /**
   * Prompts the user to pick a folder, and returns its absolute path, or null if they cancel.
   */
  pickFolder(): Promise<string | null>;
}
