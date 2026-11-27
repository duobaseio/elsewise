import { Menu, type MenuItemConstructorOptions } from 'electron';

export function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          { role: 'appMenu' } as const,
          // The window closes on Cmd+Shift+W, which leaves Cmd+W to the panel that has the focus.
          { label: 'File', submenu: [{ role: 'close', accelerator: 'Cmd+Shift+W' } as const] },
        ]
      : [{ role: 'fileMenu' } as const]),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
