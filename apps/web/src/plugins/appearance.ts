import type { Appearance, Disposable, ResolvedTheme } from '@elsewise/plugin';

/**
 * The appearance that plugins see.
 */
export class PluginAppearance implements Appearance {
  private readonly brightnessListeners = new Set<(brightness: 'light' | 'dark') => void>();
  private readonly themeListeners = new Set<(theme: ResolvedTheme) => void>();

  /**
   * Creates an appearance with the given `brightness` and `theme`.
   */
  constructor(
    private currentBrightness: 'light' | 'dark',
    private currentTheme: ResolvedTheme,
  ) {}

  get brightness(): 'light' | 'dark' {
    return this.currentBrightness;
  }

  /**
   * Sets the brightness, and calls the listeners if it changed.
   */
  set brightness(brightness: 'light' | 'dark') {
    if (brightness === this.currentBrightness) {
      return;
    }

    this.currentBrightness = brightness;
    for (const listener of this.brightnessListeners) {
      try {
        listener(brightness);
      } catch (error) {
        console.error('Brightness listener failed', error);
      }
    }
  }

  onBrightnessChange(listener: (brightness: 'light' | 'dark') => void): Disposable {
    this.brightnessListeners.add(listener);
    return () => this.brightnessListeners.delete(listener);
  }

  get theme(): ResolvedTheme {
    return this.currentTheme;
  }

  /**
   * Sets the theme, and calls the listeners if it is another object.
   */
  set theme(theme: ResolvedTheme) {
    if (theme === this.currentTheme) {
      return;
    }

    this.currentTheme = theme;
    for (const listener of this.themeListeners) {
      try {
        listener(theme);
      } catch (error) {
        console.error('Theme listener failed', error);
      }
    }
  }

  onThemeChange(listener: (theme: ResolvedTheme) => void): Disposable {
    this.themeListeners.add(listener);
    return () => this.themeListeners.delete(listener);
  }
}
