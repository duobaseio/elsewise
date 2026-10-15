import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { settingsQuery } from './settings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settingsQuery', () => {
  test('returns defaults without bridge', async () => {
    vi.stubGlobal('window', {});

    await expect(new QueryClient().fetchQuery(settingsQuery)).resolves.toBe(DEFAULT_SETTINGS);
  });
});
