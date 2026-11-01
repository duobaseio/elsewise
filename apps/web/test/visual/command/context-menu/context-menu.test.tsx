import { type ApplicationCommand, type ContextMenuGroup, DEFAULT_COMMAND_GROUPS } from '@elsewise/plugin';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { ApplicationManagerContext } from '@/application-context';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { builtInApplication } from '../../../commands';

import { THEMES } from '../../../sheet';

const COMMANDS: ApplicationCommand[] = [
  {
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    id: 'actions',
    label: 'Show context actions',
    defaultKeys: ['Alt-Enter'],
    run: () => true,
  },
  {
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    id: 'usages',
    label: 'Find usages',
    defaultKeys: ['Mod-Alt-F7'],
    run: () => true,
  },
  {
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    id: 'definition',
    label: 'Go to definition',
    defaultKeys: ['Mod-b'],
    enabled: () => false,
    run: () => true,
  },
  {
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    id: 'rename',
    label: 'Rename…',
    defaultKeys: ['Shift-F6'],
    run: () => true,
  },
  {
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    id: 'extract',
    label: 'Extract function',
    run: () => true,
  },
  {
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    id: 'wrap',
    label: 'Soft wrap',
    active: () => true,
    run: () => true,
  },
  {
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    id: 'whitespace',
    label: 'Show whitespace',
    active: () => false,
    run: () => true,
  },
];

// Groups with keys, a disabled item, checked and unchecked items, and a submenu.
const MENU: readonly ContextMenuGroup[] = [
  { id: 'actions', order: 0, items: [{ order: 0, command: 'actions' }] },
  {
    id: 'navigate',
    order: 10,
    items: [
      { order: 0, command: 'usages' },
      { order: 10, command: 'definition' },
    ],
  },
  { id: 'refactor', order: 20, items: [{ order: 0, label: 'Refactor', submenu: 'refactor' }] },
  {
    id: 'view',
    order: 30,
    items: [
      { order: 0, command: 'wrap' },
      { order: 10, command: 'whitespace' },
    ],
  },
  {
    id: 'inner',
    in: 'refactor',
    order: 0,
    items: [
      { order: 0, command: 'rename' },
      { order: 10, command: 'extract' },
    ],
  },
];

test.each(THEMES)('context menu open submenu (%s)', async (theme) => {
  // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  const application = builtInApplication({
    appearance: new AppearanceManager(theme, resolveActiveTheme(undefined, theme)),
  });
  const commands = application.commands;
  commands.add(COMMANDS);
  render(
    <ApplicationManagerContext value={application}>
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
    </ApplicationManagerContext>,
  );

  await userEvent.click(page.getByTestId('target'), { button: 'right', position: { x: 8, y: 8 } });
  await userEvent.click(page.getByRole('menuitem', { name: 'Refactor' }));
  await expect.element(page.getByRole('menuitem', { name: /^Extract function/ })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`context-menu-${theme}`);
});
