import { createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';
import { builtInCommands } from '../../test/commands';
import { OPEN_SETTINGS } from './settings';

describe('OPEN_SETTINGS', () => {
  async function open(pathname: string): Promise<string> {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: [pathname] }),
    });
    const { application } = builtInCommands();

    OPEN_SETTINGS.run({ ...application, router });

    await new Promise((resolve) => setTimeout(resolve));
    return router.history.location.pathname;
  }

  test('opens general', async () => {
    await expect(open('/Elsewise/Singapore')).resolves.toBe('/settings/appearance/general');
  });

  test('keeps open settings page', async () => {
    await expect(open('/settings/appearance/terminal')).resolves.toBe('/settings/appearance/terminal');
  });
});
