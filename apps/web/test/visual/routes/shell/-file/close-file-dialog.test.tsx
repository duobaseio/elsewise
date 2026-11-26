import { expect, onTestFinished, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { FileHandle } from '@/fs/file-handle';
import { CloseFileDialog } from '@/routes/_shell/$daemon/$project/$workspace/-file/close-file-dialog';
import { builtInApplication } from '../../../../commands';
import { fakeFileSystem } from '../../../../fake-file-system';

import { THEMES } from '../../../../sheet';

// Opens the dialog for src/main.ts with `failure`, on a page as small as the dialog needs.
async function open(theme: 'light' | 'dark', failure: string | null) {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await page.viewport(560, 320);
  const application = builtInApplication();
  await render(
    <ApplicationManagerContext value={application}>
      <CloseFileDialog />
    </ApplicationManagerContext>,
  );
  void application.files.openCloseDialog(new FileHandle(fakeFileSystem().fileSystem, '/repo', 'src/main.ts'), failure);
  await expect.element(page.getByRole('dialog')).toBeVisible();
  // The backdrop covers the page, so its shot holds the dialog.
  return page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
}

test.each(THEMES)('close file dialog changed on disk (%s)', async (theme) => {
  const sheet = await open(theme, null);

  await expect(sheet).toMatchScreenshot(`close-file-dialog-changed-on-disk-${theme}`);
});

test.each(THEMES)('close file dialog failed save (%s)', async (theme) => {
  const sheet = await open(theme, "EACCES: permission denied, open '/repo/src/main.ts'");

  await expect(sheet).toMatchScreenshot(`close-file-dialog-failed-save-${theme}`);
});
