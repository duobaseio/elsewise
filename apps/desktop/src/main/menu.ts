import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';

const SETTINGS: MenuItemConstructorOptions = {
  label: 'Settings…',
  accelerator: 'CmdOrCtrl+,',
  click: () => BrowserWindow.getFocusedWindow()?.webContents.send('settings:open'),
};

export function installMenu(): void {
  let menu: Menu;
  if (process.platform === 'darwin') {
    menu = Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          SETTINGS,
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]);
  } else {
    menu = Menu.buildFromTemplate([
      { label: 'File', submenu: [SETTINGS, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]);
  }

  Menu.setApplicationMenu(menu);
}
