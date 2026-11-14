import { DEFAULT_FRONTEND_SETTINGS } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { FileTree } from '@/routes/settings/local/file-tree';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../../../sheet';

test.each(THEMES)('file tree (%s)', async (theme) => {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_FRONTEND_SETTINGS);
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <WorkspaceStateStoreContext value={new WorkspaceStateStore(undefined)}>
          <div
            className="bg-background font-sans text-foreground"
            data-brightness={theme}
            data-testid="sheet"
            style={{ width: 800 }}
          >
            <FileTree />
          </div>
        </WorkspaceStateStoreContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'File tree' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-${theme}`);
});
