import * as z from 'zod';
import type { Brightness } from './settings';

export type FileFilter = z.infer<typeof FileFilter>;

/**
 * A kind of file a picker offers, e.g. `{ name: 'Themes', extensions: ['json'] }`. Extensions go without the dot.
 */
export const FileFilter = z.object({ name: z.string(), extensions: z.array(z.string()) });

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
   * Opens the folder at `absolutePath` in the platform's file manager.
   *
   * Throws if `absolutePath` is not a directory or cannot be opened, e.g. without permission.
   */
  openFolder(absolutePath: string): Promise<void>;

  /**
   * Prompts the user to pick a folder, and returns its absolute path, or null if they cancel.
   */
  pickFolder(): Promise<string | null>;

  /**
   * Prompts the user to pick a file, of a kind in `filters` if given, and returns its absolute path, or null if they
   * cancel.
   */
  pickFile(filters?: readonly FileFilter[]): Promise<string | null>;

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
