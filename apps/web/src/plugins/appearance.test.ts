import { afterEach, describe, expect, test, vi } from 'vitest';
import { resolveTheme } from '@/themes/themes';
import { PluginAppearance } from './appearance';

const LIGHT = resolveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light');
const DARK = resolveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('brightness', () => {
  test('is the brightness it was created with', () => {
    expect(new PluginAppearance('dark', DARK).brightness).toBe('dark');
  });

  test('is the brightness it was last set to', () => {
    const appearance = new PluginAppearance('light', LIGHT);
    appearance.brightness = 'dark';

    expect(appearance.brightness).toBe('dark');
  });
});

describe('onBrightnessChange', () => {
  test('calls the listener with each new brightness', () => {
    const appearance = new PluginAppearance('light', LIGHT);
    const listener = vi.fn();
    appearance.onBrightnessChange(listener);
    appearance.brightness = 'dark';
    appearance.brightness = 'light';

    expect(listener.mock.calls).toEqual([['dark'], ['light']]);
  });

  test('does not call the listener when the brightness stays the same', () => {
    const appearance = new PluginAppearance('dark', DARK);
    const listener = vi.fn();
    appearance.onBrightnessChange(listener);
    appearance.brightness = 'dark';

    expect(listener).not.toHaveBeenCalled();
  });

  test('does not call the listener once disposed', () => {
    const appearance = new PluginAppearance('light', LIGHT);
    const listener = vi.fn();
    appearance.onBrightnessChange(listener)();
    appearance.brightness = 'dark';

    expect(listener).not.toHaveBeenCalled();
  });

  test('reports a listener that throws and carries on to the rest', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appearance = new PluginAppearance('light', LIGHT);
    const second = vi.fn();
    appearance.onBrightnessChange(() => {
      throw new Error('broken');
    });
    appearance.onBrightnessChange(second);

    expect(() => {
      appearance.brightness = 'dark';
    }).not.toThrow();
    expect(second.mock.calls).toEqual([['dark']]);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('theme', () => {
  test('is the theme it was created with', () => {
    expect(new PluginAppearance('dark', DARK).theme).toBe(DARK);
  });

  test('is the theme it was last set to', () => {
    const appearance = new PluginAppearance('light', LIGHT);
    appearance.theme = DARK;

    expect(appearance.theme).toBe(DARK);
  });
});

describe('onThemeChange', () => {
  test('calls the listener with each new theme', () => {
    const appearance = new PluginAppearance('light', LIGHT);
    const listener = vi.fn();
    appearance.onThemeChange(listener);
    appearance.theme = DARK;
    appearance.theme = LIGHT;

    expect(listener.mock.calls).toEqual([[DARK], [LIGHT]]);
  });

  test('does not call the listener when the theme stays the same', () => {
    const appearance = new PluginAppearance('dark', DARK);
    const listener = vi.fn();
    appearance.onThemeChange(listener);
    appearance.theme = DARK;

    expect(listener).not.toHaveBeenCalled();
  });

  test('does not call the listener once disposed', () => {
    const appearance = new PluginAppearance('light', LIGHT);
    const listener = vi.fn();
    appearance.onThemeChange(listener)();
    appearance.theme = DARK;

    expect(listener).not.toHaveBeenCalled();
  });

  test('reports a listener that throws and carries on to the rest', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appearance = new PluginAppearance('light', LIGHT);
    const second = vi.fn();
    appearance.onThemeChange(() => {
      throw new Error('broken');
    });
    appearance.onThemeChange(second);

    expect(() => {
      appearance.theme = DARK;
    }).not.toThrow();
    expect(second.mock.calls).toEqual([[DARK]]);
    expect(error).toHaveBeenCalledOnce();
  });
});
