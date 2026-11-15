import type { FileTreeSelection, Workspace } from '@elsewise/frontend-plugin';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { LOCAL_DAEMON_ID } from '@/daemon';
import { DEFAULT_CONTEXT_MENU } from '@/fs/default-context-menu';
import { builtInApplication } from '../../commands';

import { THEMES } from '../../sheet';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

// Opens the file tree's menu on `paths`, with a copied path to paste and a file manager to open, on a sheet as large as
// the menu and its submenu need.
async function open(theme: 'light' | 'dark', paths: readonly string[]) {
  // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  window.bridge = {
    window: {
      cut() {},
      copy() {},
      paste() {},
      absolutePathOf: () => '',
      showPath: async () => {},
      pickPaths: async () => [],
      setBrightness() {},
      setBackground() {},
      onClose() {},
    },
  };
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
    window.bridge = undefined;
  });
  const application = builtInApplication();
  application.fileTree.clipboard = { cut: false, workspace: WORKSPACE.id, paths: ['README.md'] };
  const target: { current: FileTreeSelection } = { current: { workspace: WORKSPACE, paths } };
  render(
    <ApplicationManagerContext value={application}>
      <div
        className="bg-background font-sans text-foreground"
        data-brightness={theme}
        data-testid="sheet"
        style={{ width: 480, height: 400 }}
      >
        <CommandContextMenu menu={DEFAULT_CONTEXT_MENU} target={target} className="block size-full">
          <div className="size-full" data-testid="target" />
        </CommandContextMenu>
      </div>
    </ApplicationManagerContext>,
  );

  await userEvent.click(page.getByTestId('target'), { button: 'right', position: { x: 8, y: 8 } });
  await expect.element(page.getByRole('menuitem', { name: 'New' })).toBeVisible();
}

test.each(THEMES)('file tree context menu with new submenu (%s)', async (theme) => {
  await open(theme, ['src/main.ts']);
  await userEvent.hover(page.getByRole('menuitem', { name: 'New' }));
  await expect.element(page.getByRole('menuitem', { name: /Folder/ })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-context-menu-${theme}`);
});

test.each(THEMES)('file tree context menu on empty space (%s)', async (theme) => {
  await open(theme, []);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-context-menu-empty-space-${theme}`);
});
