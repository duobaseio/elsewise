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
}
