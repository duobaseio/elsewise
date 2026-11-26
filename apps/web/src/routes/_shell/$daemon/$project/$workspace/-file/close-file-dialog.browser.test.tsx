import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { FileHandle } from '@/fs/file-handle';
import { builtInApplication } from '../../../../../../../test/commands';
import { fakeFileSystem } from '../../../../../../../test/fake-file-system';
import { CloseFileDialog } from './close-file-dialog';

// Renders the dialog, and opens it for src/main.ts with `failure`.
async function mount(failure: string | null) {
  const application = builtInApplication();
  const screen = await render(
    <ApplicationManagerContext value={application}>
      <CloseFileDialog />
    </ApplicationManagerContext>,
  );
  const file = new FileHandle(fakeFileSystem().fileSystem, '/repo', 'src/main.ts');
  const action = application.files.openCloseDialog(file, failure);
  await expect.element(page.getByRole('dialog')).toBeVisible();
  return { application, file, action, screen };
}

describe('CloseFileDialog', () => {
  test('offers to overwrite file that changed on disk', async () => {
    const { action } = await mount(null);

    await expect.element(page.getByRole('heading', { name: 'Overwrite “main.ts”?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Overwrite' }));

    await expect(action).resolves.toBe('overwrite');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  test('closes file that changed on disk without saving', async () => {
    const { action } = await mount(null);

    await userEvent.click(page.getByRole('button', { name: 'Don’t save' }));

    await expect(action).resolves.toBe('discard');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  test('shows why saving failed, without overwrite', async () => {
    const { action } = await mount('The daemon is unreachable.');

    await expect.element(page.getByRole('heading', { name: 'Close “main.ts” without saving?' })).toBeVisible();
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Could not save “main.ts”The daemon is unreachable.');
    await expect.element(page.getByRole('button', { name: 'Overwrite' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Don’t save' }));

    await expect(action).resolves.toBe('discard');
  });

  test('cancels from button', async () => {
    const { action } = await mount(null);

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    await expect(action).resolves.toBe('cancel');
  });

  test('cancels on escape', async () => {
    const { action } = await mount(null);

    await userEvent.keyboard('{Escape}');

    await expect(action).resolves.toBe('cancel');
  });

  test('cancels when unmounted', async () => {
    const { action, screen } = await mount(null);

    await screen.unmount();

    await expect(action).resolves.toBe('cancel');
  });

  test('cancels earlier file when opened for another', async () => {
    const { application, file, action } = await mount(null);

    void application.files.openCloseDialog(file, 'unreachable');

    await expect(action).resolves.toBe('cancel');
    await expect.element(page.getByRole('heading', { name: 'Close “main.ts” without saving?' })).toBeVisible();
  });
});
