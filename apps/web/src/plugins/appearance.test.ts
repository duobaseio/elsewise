import { afterEach, describe, expect, test, vi } from 'vitest';
import { PluginAppearance } from './appearance';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('brightness', () => {
  test('is the brightness it was created with', () => {
    expect(new PluginAppearance('dark').brightness).toBe('dark');
  });

  test('is the brightness it was last set to', () => {
    const appearance = new PluginAppearance('light');
    appearance.brightness = 'dark';

    expect(appearance.brightness).toBe('dark');
  });
});

describe('onBrightnessChange', () => {
  test('calls the listener with each new brightness', () => {
    const appearance = new PluginAppearance('light');
    const listener = vi.fn();
    appearance.onBrightnessChange(listener);
    appearance.brightness = 'dark';
    appearance.brightness = 'light';

    expect(listener.mock.calls).toEqual([['dark'], ['light']]);
  });

  test('does not call the listener when the brightness stays the same', () => {
    const appearance = new PluginAppearance('dark');
    const listener = vi.fn();
    appearance.onBrightnessChange(listener);
    appearance.brightness = 'dark';

    expect(listener).not.toHaveBeenCalled();
  });

  test('does not call the listener once disposed', () => {
    const appearance = new PluginAppearance('light');
    const listener = vi.fn();
    appearance.onBrightnessChange(listener)();
    appearance.brightness = 'dark';

    expect(listener).not.toHaveBeenCalled();
  });

  test('reports a listener that throws and carries on to the rest', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appearance = new PluginAppearance('light');
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
