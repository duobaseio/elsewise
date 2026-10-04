import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { settingsQuery } from './settings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settingsQuery', () => {
  test('returns the defaults without a bridge', async () => {
    vi.stubGlobal('window', {});

    await expect(new QueryClient().fetchQuery(settingsQuery)).resolves.toBe(DEFAULT_SETTINGS);
  });

  test("returns the bridge's settings", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, theme: { source: 'elsewise', name: 'nord' } },
      },
    };
    vi.stubGlobal('window', { bridge: { settings: { load: async () => settings } } });

    await expect(new QueryClient().fetchQuery(settingsQuery)).resolves.toBe(settings);
  });
});
