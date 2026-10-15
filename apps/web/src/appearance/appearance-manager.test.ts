import { afterEach, describe, expect, test, vi } from 'vitest';
import { resolveActiveTheme } from '@/appearance/themes';
import { AppearanceManager } from './appearance-manager';

const LIGHT = resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light');
const DARK = resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('onBrightnessChange', () => {
  test('calls listener with each new brightness', () => {
    const appearance = new AppearanceManager('light', LIGHT);
    const listener = vi.fn();
    appearance.onBrightnessChange(listener);
    appearance.brightness = 'dark';
    appearance.brightness = 'light';

    expect(listener.mock.calls).toEqual([['dark'], ['light']]);
  });

  test('ignores unchanged brightness', () => {
    const appearance = new AppearanceManager('dark', DARK);
    const listener = vi.fn();
    appearance.onBrightnessChange(listener);
    appearance.brightness = 'dark';

    expect(listener).not.toHaveBeenCalled();
  });

  test('stops once disposed', () => {
    const appearance = new AppearanceManager('light', LIGHT);
    const listener = vi.fn();
    appearance.onBrightnessChange(listener)();
    appearance.brightness = 'dark';

    expect(listener).not.toHaveBeenCalled();
  });

  test('logs throwing listener and continues', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appearance = new AppearanceManager('light', LIGHT);
    const second = vi.fn();
    appearance.onBrightnessChange(() => {
      throw new Error('broken');
    });
    appearance.onBrightnessChange(second);

    appearance.brightness = 'dark';

    expect(second.mock.calls).toEqual([['dark']]);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('onThemeChange', () => {
  test('calls listener with each new theme', () => {
    const appearance = new AppearanceManager('light', LIGHT);
    const listener = vi.fn();
    appearance.onThemeChange(listener);
    appearance.theme = DARK;
    appearance.theme = LIGHT;

    expect(listener.mock.calls).toEqual([[DARK], [LIGHT]]);
  });

  test('ignores unchanged theme', () => {
    const appearance = new AppearanceManager('dark', DARK);
    const listener = vi.fn();
    appearance.onThemeChange(listener);
    appearance.theme = DARK;

    expect(listener).not.toHaveBeenCalled();
  });

  test('stops once disposed', () => {
    const appearance = new AppearanceManager('light', LIGHT);
    const listener = vi.fn();
    appearance.onThemeChange(listener)();
    appearance.theme = DARK;

    expect(listener).not.toHaveBeenCalled();
  });

  test('logs throwing listener and continues', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appearance = new AppearanceManager('light', LIGHT);
    const second = vi.fn();
    appearance.onThemeChange(() => {
      throw new Error('broken');
    });
    appearance.onThemeChange(second);

    appearance.theme = DARK;

    expect(second.mock.calls).toEqual([[DARK]]);
    expect(error).toHaveBeenCalledOnce();
  });
});
