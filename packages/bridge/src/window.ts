/**
 * The embedder's native window.
 */
export interface WindowBridge {
  /**
   * The window's background color, as a CSS color, e.g. `#1e1e1e`.
   */
  getBackground(): Promise<string>;

  /**
   * Sets the window's background color, which is shown before a page is painted and during resizes.
   * `color` is a CSS color, e.g. `#1e1e1e`.
   */
  setBackground(color: string): void;
}
