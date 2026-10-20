import type { ActiveTheme, Appearance, Disposable } from '@elsewise/plugin';

export class AppearanceManager implements Appearance {
  private readonly brightnessListeners = new Set<(brightness: 'light' | 'dark') => void>();
  private readonly themeListeners = new Set<(theme: ActiveTheme) => void>();

  constructor(
    private currentBrightness: 'light' | 'dark',
    private currentTheme: ActiveTheme,
  ) {}

  get brightness(): 'light' | 'dark' {
    return this.currentBrightness;
  }

  /**
   * Sets the brightness, and calls the listeners only if it changed.
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
    return () => {
      this.brightnessListeners.delete(listener);
    };
  }

  get theme(): ActiveTheme {
    return this.currentTheme;
  }

  /**
   * Sets the theme, and calls the listeners only if it changed.
   */
  set theme(theme: ActiveTheme) {
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

  onThemeChange(listener: (theme: ActiveTheme) => void): Disposable {
    this.themeListeners.add(listener);
    return () => {
      this.themeListeners.delete(listener);
    };
  }
}
