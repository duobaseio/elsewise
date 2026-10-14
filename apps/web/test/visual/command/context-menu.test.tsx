import type { ApplicationCommand, ContextMenu } from '@elsewise/plugin';
import { describe, expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { CommandContextMenu } from '@/command/context-menu';
import { EditorManager } from '@/editor/editor-manager';

import { THEMES } from '../../sheet';

const COMMANDS: ApplicationCommand[] = [
  { scope: 'application', id: 'actions', label: 'Show context actions', defaultKeys: ['Alt-Enter'], run: () => {} },
  { scope: 'application', id: 'usages', label: 'Find usages', defaultKeys: ['Mod-Alt-F7'], run: () => {} },
  {
    scope: 'application',
    id: 'definition',
    label: 'Go to definition',
    defaultKeys: ['Mod-b'],
    enabled: () => false,
    run: () => {},
  },
  { scope: 'application', id: 'rename', label: 'Rename…', defaultKeys: ['Shift-F6'], run: () => {} },
  { scope: 'application', id: 'extract', label: 'Extract function', run: () => {} },
];

// Groups with keys, a disabled item, and a submenu.
const MENU: ContextMenu = {
  submenus: { refactor: 'Refactor' },
  groups: {
    actions: { order: 0 },
    navigate: { order: 10 },
    refactor: { order: 20 },
    inner: { menu: 'refactor', order: 0 },
  },
  items: {
    actions: [{ type: 'item', order: 0, command: 'actions' }],
    navigate: [
      { type: 'item', order: 0, command: 'usages' },
      { type: 'item', order: 10, command: 'definition' },
    ],
    refactor: [{ type: 'submenu', order: 0, submenu: 'refactor' }],
    inner: [
      { type: 'item', order: 0, command: 'rename' },
      { type: 'item', order: 10, command: 'extract' },
    ],
  },
};

describe.each(THEMES)('context menu (%s)', (theme) => {
  test('open submenu', async () => {
    // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
    document.documentElement.dataset.brightness = theme;
    onTestFinished(() => {
      delete document.documentElement.dataset.brightness;
    });
    const editor = new EditorManager();
    const commands = new CommandManager({
      appearance: new AppearanceManager(theme, resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, theme)),
      editor,
    });
    commands.add(COMMANDS);
    render(
      <CommandManagerContext value={commands}>
        <div
          className="bg-background font-sans text-foreground"
          data-brightness={theme}
          data-testid="sheet"
          style={{ width: 560, height: 240 }}
        >
          <CommandContextMenu menu={MENU} className="block size-full">
            <div className="size-full" data-testid="target" />
          </CommandContextMenu>
        </div>
      </CommandManagerContext>,
    );

    await userEvent.click(page.getByTestId('target'), { button: 'right', position: { x: 8, y: 8 } });
    await userEvent.click(page.getByRole('menuitem', { name: 'Refactor' }));
    await expect.element(page.getByRole('menuitem', { name: /^Extract function/ })).toBeVisible();

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`context-menu-${theme}`);
  });
});
