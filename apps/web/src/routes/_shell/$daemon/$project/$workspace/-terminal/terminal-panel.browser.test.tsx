import { create } from '@bufbuild/protobuf';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { Terminal } from '@xterm/xterm';
import type { DockviewApi } from 'dockview-react';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import {
  CreateTerminalResponseSchema,
  DeleteTerminalsResponseSchema,
  GetTerminalsResponseSchema,
} from '@/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { settingsQuery } from '@/settings/settings';
import { TerminalManager } from '@/terminals/terminal-manager';
import { builtInApplication } from '../../../../../../../test/commands';
import { stubComponents } from '../../../../../../../test/dock-stubs';
import { SETTINGS, terminals } from '../../../../../../../test/terminal';
import { FileTab } from '../-file/file-tab';
import { FileTreeTab, WorkspaceDock } from '../route';
import { TerminalPanel } from './terminal-panel';
import { TerminalTab } from './terminal-tab';

import 'dockview-react/dist/styles/dockview.css';

const SINGAPORE: WorkspaceId = { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' };

// The daemon of Singapore, which creates tokyo-1 running `program`.
function setUp(program = '') {
  const terminal = { workspaceId: 'singapore', id: 'tokyo-1', name: 'Terminal', program };
  const deleteTerminals = vi.fn(async () => create(DeleteTerminalsResponseSchema));
  const getTerminals = vi.fn(async () => create(GetTerminalsResponseSchema, { terminals: [terminal] }));
  const fake = terminals({
    createTerminal: async () => create(CreateTerminalResponseSchema, { terminal }),
    getTerminals,
    deleteTerminals,
  });
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, { terminals: fake.client } as unknown as Daemon);
  client.setQueryData(settingsQuery.queryKey, SETTINGS);
  return { ...fake, client, deleteTerminals, getTerminals, manager: new TerminalManager(client) };
}

// Renders the dock of Singapore with real terminal panels, restoring `layout` if given.
async function mount({ client, manager }: ReturnType<typeof setUp>, layout?: unknown) {
  let api: DockviewApi | undefined;
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          layout={layout}
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
  const screen = await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <ApplicationManagerContext
          value={builtInApplication({
            router,
            terminals: manager,
            panelComponents: stubComponents({
              fileTree: { tab: FileTreeTab },
              file: { tab: FileTab },
              terminal: { tab: TerminalTab, panel: TerminalPanel },
            }),
          })}
        >
          <RouterProvider router={router} />
        </ApplicationManagerContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.poll(() => api).toBeDefined();
  return { api: api as DockviewApi, unmount: () => screen.unmount() };
}

// Adds tokyo-1 to Singapore and shows it.
async function add(setup: ReturnType<typeof setUp>, api: DockviewApi) {
  const session = await setup.manager.store.add(SINGAPORE);
  api.addPanel({
    id: 'terminal:tokyo-1',
    component: 'terminal',
    tabComponent: 'terminal',
    title: session.name,
    params: { session: session.id.session },
  });
  return session.id;
}

// Adds tokyo-1 to Singapore, shows it, and waits for it to attach.
async function show(setup: ReturnType<typeof setUp>, api: DockviewApi) {
  const id = await add(setup, api);
  await expect.poll(() => setup.sent.length).toBeGreaterThan(0);
  return id;
}

// Makes the daemon lookups from now on return what `daemon` does.
function lookUpDaemon(setup: ReturnType<typeof setUp>, daemon: () => Promise<Daemon>) {
  const query = setup.client.query.bind(setup.client);
  return vi
    .spyOn(setup.client, 'query')
    .mockImplementation((options) => (options.queryKey[0] === 'daemons' ? daemon() : query(options)) as never);
}

// Returns the text on `xterm`'s screen.
function text(xterm: Terminal | undefined): string {
  const buffer = xterm?.buffer.active;
  return Array.from({ length: buffer?.length ?? 0 }, (_, row) => buffer?.getLine(row)?.translateToString(true)).join(
    '\n',
  );
}

test('attaches shown terminal', async () => {
  const setup = setUp();
  const { api } = await mount(setup);

  await show(setup, api);

  expect(api.getPanel('terminal:tokyo-1')?.title).toBe('Terminal');
  expect(setup.sent[0]).toMatchObject({ event: { case: 'open', value: { terminalId: 'tokyo-1' } } });
});

test('keeps terminal across remount', async () => {
  const setup = setUp();
  const first = await mount(setup);
  const id = await show(setup, first.api);
  const xterm = setup.manager.get(id)?.terminal;
  const layout = first.api.toJSON();
  await first.unmount();

  await mount(setup, layout);

  await expect.poll(() => xterm?.element?.isConnected).toBe(true);
  expect(setup.manager.get(id)?.terminal).toBe(xterm);
  expect(setup.sent.filter((request) => request.event?.case === 'open')).toHaveLength(1);
  expect(setup.deleteTerminals).not.toHaveBeenCalled();
});

test('closes shell on exit', async () => {
  const setup = setUp();
  const { api } = await mount(setup);
  await show(setup, api);

  setup.respond({ case: 'exit', value: { cause: { case: 'code', value: 0 } } });

  await expect.poll(() => api.getPanel('terminal:tokyo-1')).toBeUndefined();
  expect(setup.deleteTerminals).toHaveBeenCalledExactlyOnceWith({ terminalIds: ['tokyo-1'] });
});

test('keeps program open on exit', async () => {
  const setup = setUp('npm');
  const { api } = await mount(setup);
  const id = await show(setup, api);

  setup.respond({ case: 'exit', value: { cause: { case: 'code', value: 0 } } });

  await expect.poll(() => setup.manager.get(id)?.session.exit).toEqual({ code: 0 });
  expect(api.getPanel('terminal:tokyo-1')).toBeDefined();
  expect(setup.deleteTerminals).not.toHaveBeenCalled();
});

test('adds addons once shown', async () => {
  const setup = setUp();
  const { api } = await mount(setup);
  const activate = vi.fn();
  setup.manager.addAddons([() => ({ activate, dispose() {} })]);

  const id = await show(setup, api);

  await expect.poll(() => activate).toHaveBeenCalledExactlyOnceWith(setup.manager.get(id)?.terminal);
});

test('disposes addons once disposed', async () => {
  const setup = setUp();
  const { api } = await mount(setup);
  await show(setup, api);
  const dispose = vi.fn();
  const remove = setup.manager.addAddons([() => ({ activate() {}, dispose })]);

  remove();

  expect(dispose).toHaveBeenCalledOnce();
});

test('attaches despite throwing addon', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const setup = setUp();
  const { api } = await mount(setup);
  setup.manager.addAddons([
    () => {
      throw new Error('broken');
    },
  ]);

  await show(setup, api);

  expect(setup.sent[0]).toMatchObject({ event: { case: 'open' } });
});

test('adds remaining addons past throwing addon', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const setup = setUp();
  const { api } = await mount(setup);
  await show(setup, api);
  const activate = vi.fn();

  const remove = setup.manager.addAddons([
    () => {
      throw new Error('broken');
    },
    () => ({ activate, dispose() {} }),
  ]);

  expect(remove).toBeTypeOf('function');
  expect(activate).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledOnce();
});

test('shows failure to reach daemon', async () => {
  const setup = setUp();
  const { api } = await mount(setup);
  const session = await setup.manager.store.add(SINGAPORE);
  lookUpDaemon(setup, () => Promise.reject(new Error('The daemon is unreachable.')));

  api.addPanel({
    id: 'terminal:tokyo-1',
    component: 'terminal',
    tabComponent: 'terminal',
    title: session.name,
    params: { session: session.id.session },
  });

  await expect.poll(() => text(setup.manager.get(session.id)?.terminal)).toContain('The daemon is unreachable.');
});

test('shows failure to open', async () => {
  const setup = setUp();
  setup.getTerminals.mockRejectedValueOnce(new Error('connect ECONNREFUSED daemon.sock'));
  const { api } = await mount(setup);

  api.addPanel({ id: 'terminal:tokyo-1', component: 'terminal', params: { session: 'tokyo-1' } });

  await expect.element(page.getByRole('heading', { name: "Couldn't open the terminal" })).toBeVisible();
  await expect.element(page.getByText('connect ECONNREFUSED daemon.sock')).toBeVisible();
  expect(api.getPanel('terminal:tokyo-1')).toBeDefined();
});

test('opens on retry', async () => {
  const setup = setUp();
  setup.getTerminals.mockRejectedValueOnce(new Error('connect ECONNREFUSED daemon.sock'));
  const { api } = await mount(setup);
  api.addPanel({ id: 'terminal:tokyo-1', component: 'terminal', params: { session: 'tokyo-1' } });

  await page.getByRole('button', { name: 'Try again' }).click();

  await expect.poll(() => setup.sent.length).toBeGreaterThan(0);
  await expect.element(page.getByRole('heading', { name: "Couldn't open the terminal" })).not.toBeInTheDocument();
});

test('skips attaching terminal deleted while attaching', async () => {
  const setup = setUp();
  const { api } = await mount(setup);
  const id = await add(setup, api);
  const real = setup.client.getQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey) as Daemon;
  const { promise: held, resolve } = Promise.withResolvers<Daemon>();
  let lookups = 0;
  lookUpDaemon(setup, () => (++lookups === 1 ? held : Promise.resolve(real)));
  await expect.poll(() => lookups).toBe(1);

  await setup.manager.delete(id);
  resolve(real);

  await new Promise((settled) => setTimeout(settled));
  expect(setup.sent).toEqual([]);
});

test('reports running once shell prints', async () => {
  const setup = setUp();
  const { api } = await mount(setup);
  const id = await show(setup, api);

  expect(setup.manager.get(id)?.session.state).toBe('stopped');

  setup.respond({ case: 'output', value: new TextEncoder().encode('$ ') });

  await expect.poll(() => setup.manager.get(id)?.session.state).toBe('running');
});

test('reports exit of replayed program without running', async () => {
  const setup = setUp('npm');
  const { api } = await mount(setup);
  const states: string[] = [];
  setup.manager.onSessionChange((view) => states.push(view.session.state));
  const id = await show(setup, api);

  setup.respond(
    { case: 'buffer', value: new TextEncoder().encode('ok') },
    { case: 'exit', value: { cause: { case: 'code', value: 0 } } },
  );

  await expect.poll(() => setup.manager.get(id)?.session.state).toBe('exited');
  expect(states).toEqual(['exited']);
});

test('keeps state when stream fails', async () => {
  const setup = setUp();
  const { api } = await mount(setup);
  const id = await show(setup, api);

  setup.fail(new Error('the terminal does not exist'));

  await expect.poll(() => text(setup.manager.get(id)?.terminal)).toContain('the terminal does not exist');
  expect(setup.manager.get(id)?.session.state).toBe('stopped');
});
