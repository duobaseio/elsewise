import { type ApplicationCommand, DEFAULT_COMMAND_GROUPS } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { DockviewPanelApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { TerminalManager } from '@/terminals/terminal-manager';
import { builtInApplication } from '../../../../../../../test/commands';
import { TerminalHeader, terminalTooltip } from './terminal-header';

const SESSION = { daemon: 'local', project: 'elsewise', workspace: 'singapore', session: 'a' };

// The menu around the header, as a tab has it.
const MENU = [{ id: 'edit', items: [{ command: 'rename' }] }];
const RENAME: ApplicationCommand = {
  scope: 'application',
  id: 'rename',
  group: DEFAULT_COMMAND_GROUPS.application.id,
  label: 'Rename session',
  run: ({ terminals }: ApplicationManager) => {
    terminals.renaming = SESSION;
    return true;
  },
};

// Renders the header of the session in the workspace Singapore, titled Terminal, and returns its terminals, whose
// rename is recorded.
async function mount() {
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <CommandContextMenu menu={MENU}>
        <TerminalHeader
          api={{ id: 'terminal:a', title: 'Terminal', setTitle() {} } as unknown as DockviewPanelApi}
          params={{ session: SESSION.session }}
        />
      </CommandContextMenu>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([workspace])]),
    history: createMemoryHistory({ initialEntries: ['/local/elsewise/singapore'] }),
  });
  const terminals = new TerminalManager(new QueryClient());
  const renamed = vi.spyOn(terminals, 'rename').mockResolvedValue();
  const application = builtInApplication({ router, terminals });
  application.commands.add([RENAME]);
  await render(
    <ApplicationManagerContext value={application}>
      <RouterProvider router={router} />
    </ApplicationManagerContext>,
  );
  await expect.element(page.getByText('Terminal')).toBeVisible();
  return { terminals, renamed };
}

describe('TerminalHeader', () => {
  test('shows field with name while its session is renamed', async () => {
    const { terminals } = await mount();

    terminals.renaming = { ...SESSION, session: 'other' };
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(page.getByRole('textbox').elements()).toHaveLength(0);

    terminals.renaming = SESSION;

    await expect.element(page.getByRole('textbox', { name: 'Session name' })).toHaveValue('Terminal');
    await expect.element(page.getByRole('textbox', { name: 'Session name' })).toHaveFocus();
    await expect.element(page.getByText(/rename · .* cancel/)).toBeVisible();
  });

  test('keeps name and width while session is renamed', async () => {
    const { terminals } = await mount();
    const header = page.getByText('Terminal').element().closest('div') as HTMLElement;
    const { width } = header.getBoundingClientRect();

    terminals.renaming = SESSION;

    await expect.element(page.getByRole('textbox', { name: 'Session name' })).toBeVisible();
    await expect.element(page.getByText('Terminal', { exact: true })).toBeVisible();
    expect(header.getBoundingClientRect().width).toBe(width);
  });

  test('renames session on press outside field', async () => {
    const { terminals, renamed } = await mount();
    terminals.renaming = SESSION;

    await userEvent.fill(page.getByRole('textbox', { name: 'Session name' }), 'Build');
    await userEvent.click(page.getByText('Terminal', { exact: true }));

    await vi.waitFor(() => expect(renamed).toHaveBeenCalledExactlyOnceWith(SESSION, 'Build'));
    expect(terminals.renaming).toBeNull();
  });

  test('keeps right-click in field from context menu around header', async () => {
    const { terminals } = await mount();
    terminals.renaming = SESSION;
    await expect.element(page.getByRole('textbox', { name: 'Session name' })).toHaveFocus();

    await userEvent.click(page.getByRole('textbox', { name: 'Session name' }), { button: 'right' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(page.getByRole('menu').elements()).toHaveLength(0);
  });

  test('shows name of renamed session', async () => {
    const { terminals } = await mount();
    vi.spyOn(terminals, 'get').mockReturnValue({ session: { name: 'Build' } } as never);

    terminals.renaming = null;

    await expect.element(page.getByText('Build')).toBeVisible();
  });

  test('renames session on Enter', async () => {
    const { terminals, renamed } = await mount();
    terminals.renaming = SESSION;

    await userEvent.fill(page.getByRole('textbox', { name: 'Session name' }), 'Build');
    await userEvent.keyboard('{Enter}');

    expect(renamed).toHaveBeenCalledExactlyOnceWith(SESSION, 'Build');
    expect(terminals.renaming).toBeNull();
    await expect.element(page.getByText('Terminal')).toBeVisible();
  });

  test('renames session when field loses focus', async () => {
    const { terminals, renamed } = await mount();
    terminals.renaming = SESSION;

    await userEvent.fill(page.getByRole('textbox', { name: 'Session name' }), 'Build');
    await userEvent.tab();

    await vi.waitFor(() => expect(renamed).toHaveBeenCalledExactlyOnceWith(SESSION, 'Build'));
    expect(terminals.renaming).toBeNull();
  });

  test('keeps name on Escape', async () => {
    const { terminals, renamed } = await mount();
    terminals.renaming = SESSION;

    await userEvent.fill(page.getByRole('textbox', { name: 'Session name' }), 'Build');
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByText('Terminal')).toBeVisible();
    expect(renamed).not.toHaveBeenCalled();
    expect(terminals.renaming).toBeNull();
  });

  test('takes spaces typed into field', async () => {
    const { terminals, renamed } = await mount();
    terminals.renaming = SESSION;

    await userEvent.fill(page.getByRole('textbox', { name: 'Session name' }), '');
    await userEvent.keyboard('dev server{Enter}');

    expect(renamed).toHaveBeenCalledExactlyOnceWith(SESSION, 'dev server');
  });
});

describe('terminalTooltip', () => {
  const PANEL = {
    id: 'terminal:a',
    type: 'terminal',
    tab: true,
    closable: true,
    session: SESSION,
    closeConfirmation: false,
  } as const;

  test('returns name of session', async () => {
    const application = builtInApplication();
    vi.spyOn(application.terminals, 'get').mockReturnValue({ session: { name: 'Build' } } as never);

    await render(terminalTooltip(application, {} as never, PANEL));

    await expect.element(page.getByText('Build', { exact: true })).toBeVisible();
  });

  test('returns none while session is renamed', () => {
    const application = builtInApplication();
    vi.spyOn(application.terminals, 'get').mockReturnValue({ session: { name: 'Build' } } as never);

    application.terminals.renaming = SESSION;

    expect(terminalTooltip(application, {} as never, PANEL)).toBeNull();
  });

  test('returns none for session that is not loaded', () => {
    expect(terminalTooltip(builtInApplication(), {} as never, PANEL)).toBeNull();
  });
});
