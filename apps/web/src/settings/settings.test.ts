import { DEFAULT_FRONTEND_SETTINGS } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { settingsQuery } from '@/settings/settings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settingsQuery', () => {
  test('returns defaults without bridge', async () => {
    vi.stubGlobal('window', {});

    await expect(new QueryClient().query(settingsQuery)).resolves.toBe(DEFAULT_FRONTEND_SETTINGS);
  });
});
