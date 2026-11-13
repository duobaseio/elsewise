import type { Brightness, PickPathsOptions } from '@elsewise/frontend-plugin';

/**
 * The embedder's native window.
 */
export interface WindowBridge {
  /**
   * Cuts the selection in the focused page.
   */
  cut(): void;

  /**
   * Copies the selection in the focused page.
   */
  copy(): void;

  /**
   * Pastes into the focused page.
   */
  paste(): void;

  /**
   * Returns the absolute path of a file from the platform, e.g. one dropped onto the page, or `''` if it is not on
   * disk.
   */
  absolutePathOf(file: File): string;

  /**
   * Shows `absolutePath` in the platform's file manager.
   *
   * Throws if `absolutePath` does not exist or cannot be opened, e.g. without permission.
   */
  showPath(absolutePath: string): Promise<void>;

  /**
   * Prompts the user to pick files or folders, and returns their absolute paths, or none if they cancel. Links in the
   * paths are resolved unless `resolveAliases` is false.
   */
  pickPaths(options?: PickPathsOptions): Promise<string[]>;

  /**
   * Sets the brightness of the window's native parts, e.g. its buttons, menus and dialogs.
   */
  setBrightness(brightness: Brightness): void;

  /**
   * Sets the window's background color, which is shown before a page is painted and during resizes.
   * `color` is a CSS color, e.g. `#1e1e1e`.
   */
  setBackground(color: string): void;

  /**
   * Sets what runs before the window closes, e.g. disabling the plugins, replacing what was set before. The window
   * closes once it settles, or after a few seconds if it does not.
   */
  onClose(handler: () => Promise<void>): void;
}
