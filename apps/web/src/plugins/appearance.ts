import type { Appearance, Disposable } from '@elsewise/plugin';

/**
 * The appearance that plugins see.
 */
export class PluginAppearance implements Appearance {
  private readonly listeners = new Set<(brightness: 'light' | 'dark') => void>();

  /**
   * Creates an appearance with the given `brightness`.
   */
  public constructor(private current: 'light' | 'dark') {}

  public get brightness(): 'light' | 'dark' {
    return this.current;
  }

  /**
   * Sets the brightness, and calls the listeners if it changed.
   */
  public set brightness(brightness: 'light' | 'dark') {
    if (brightness === this.current) {
      return;
    }

    this.current = brightness;
    for (const listener of this.listeners) {
      try {
        listener(brightness);
      } catch (error) {
        console.error('Brightness listener failed', error);
      }
    }
  }

  public onBrightnessChange(listener: (brightness: 'light' | 'dark') => void): Disposable {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
