import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { DockviewApi } from 'dockview-react';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import { CreateTerminalResponseSchema } from '@/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { settingsQuery } from '@/settings/settings';
import { builtInApplication } from '../../../../../../../test/commands';
import { STUB_PANELS } from '../../../../../../../test/dock-stubs';
import { SETTINGS, terminals } from '../../../../../../../test/terminal';
import { WorkspaceDock } from '../route';
import { TerminalPanel } from './terminal-panel';

import 'dockview-react/dist/styles/dockview.css';

// Renders the dock of Singapore with a real terminal panel, whose terminal the daemon creates as tokyo-1.
async function mount() {
  const createTerminal = vi.fn(async () =>
    create(CreateTerminalResponseSchema, {
      terminal: { workspaceId: 'singapore', id: 'tokyo-1', name: 'elsewise-singapore-1' },
    }),
  );
  const fake = terminals({ createTerminal });
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, { terminals: fake.client } as unknown as Daemon);
  client.setQueryData(settingsQuery.queryKey, SETTINGS);
  let api: DockviewApi | undefined;
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          panels={{ ...STUB_PANELS, terminal: TerminalPanel }}
          onDockviewReady={(ready) => {
            api = ready;
          }}
        />
      </div>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([workspace])]),
    history: createMemoryHistory({ initialEntries: [`/${LOCAL_DAEMON_ID}/elsewise/singapore`] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <ApplicationManagerContext value={builtInApplication({ router })}>
          <RouterProvider router={router} />
        </ApplicationManagerContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.poll(() => api).toBeDefined();
  return { ...fake, api: api as DockviewApi, createTerminal };
}

test('creates terminal', async () => {
  const { api, createTerminal } = await mount();

  await expect.element(page.getByText('elsewise-singapore-1')).toBeVisible();
  expect(createTerminal).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'singapore' });
  expect(api.getPanel('term-1')?.params).toEqual({ terminalId: 'tokyo-1' });
});

test('closes on exit', async () => {
  const { api, respond, sent } = await mount();
  await expect.poll(() => sent.length).toBeGreaterThan(0);

  respond({ case: 'exit', value: { cause: { case: 'code', value: 0 } } });

  await expect.poll(() => api.getPanel('term-1')).toBeUndefined();
});
