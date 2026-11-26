import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { builtInApplication } from '../../../../../../../test/commands';
import { CloseTerminalDialog } from './close-terminal-dialog';

const SESSION = {
  id: { daemon: 'd', project: 'p', workspace: 'w', session: '1' },
  name: 'Server',
  cwd: '',
  program: '',
  args: [],
  restore: true,
  state: 'running',
  exit: null,
} as const;

// Renders the dialog, and opens it for the session.
async function mount() {
  const application = builtInApplication();
  const screen = await render(
    <ApplicationManagerContext value={application}>
      <CloseTerminalDialog />
    </ApplicationManagerContext>,
  );
  const confirmed = application.terminals.openCloseDialog(SESSION);
  await expect.element(page.getByRole('dialog')).toBeVisible();
  return { confirmed, screen };
}

describe('CloseTerminalDialog', () => {
  test('confirms closing terminal', async () => {
    const { confirmed } = await mount();

    await expect.element(page.getByRole('heading', { name: 'Close “Server”?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Close' }));

    await expect(confirmed).resolves.toBe(true);
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  test('cancels from button', async () => {
    const { confirmed } = await mount();

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    await expect(confirmed).resolves.toBe(false);
  });

  test('cancels on escape', async () => {
    const { confirmed } = await mount();

    await userEvent.keyboard('{Escape}');

    await expect(confirmed).resolves.toBe(false);
  });

  test('cancels when unmounted', async () => {
    const { confirmed, screen } = await mount();

    await screen.unmount();

    await expect(confirmed).resolves.toBe(false);
  });
});
