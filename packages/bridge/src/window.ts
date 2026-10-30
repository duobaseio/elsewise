import type { Brightness } from './settings.js';

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
