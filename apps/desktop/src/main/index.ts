import path from 'node:path';
import type { Brightness } from '@elsewise/bridge';
import { dataLocalDir } from '@elsewise/fs';
import { app, BrowserWindow, nativeTheme, protocol, shell } from 'electron';
import { installMenu } from './menu';
import { handlePlugins } from './plugins';
import { handleAppScheme } from './protocol';
import { handleSettings } from './settings';
import { loadWindow, saveWindow } from './window';

app.setName('Elsewise');
app.setPath('userData', path.join(dataLocalDir(), 'chromium'));

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      codeCache: true,
      corsEnabled: !!process.env.ELECTRON_RENDERER_URL,
    },
  },
]);

app.whenReady().then(() => {
  handleAppScheme();
  handlePlugins();
  handleSettings();
  installMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function createWindow() {
  const { maximized, ...rectangle } = loadWindow();
  const main = new BrowserWindow({
    ...rectangle,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  saveWindow(main);

  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) {
    void main.loadURL(dev);
  } else {
    void main.loadURL('app://elsewise/');
  }

  // Without this, a link without a target (an `<a href>` in a plugin) replaces Elsewise with the linked page, which
  // then gets the preload's bridge.
  const home = new URL(dev ?? 'app://elsewise/');
  main.webContents.on('will-navigate', (event, url) => {
    const target = URL.parse(url);
    if (target?.protocol === home.protocol && target.host === home.host) {
      return;
    }

    event.preventDefault();
    if (target?.protocol === 'http:' || target?.protocol === 'https:') {
      void shell.openExternal(url);
    }
  });
  // Without this, a link the renderer opens (a terminal URL) becomes a bare BrowserWindow.
  main.webContents.setWindowOpenHandler(({ url }) => {
    const protocol = URL.parse(url)?.protocol;
    if (protocol === 'http:' || protocol === 'https:') {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });
  main.webContents.ipc.on(
      'window:brightness',
      (_event, brightness: Brightness) => (nativeTheme.themeSource = brightness),
  );
  main.webContents.ipc.on('window:background', (_event, color: string) => main.setBackgroundColor(color));
  main.webContents.ipc.once('window:background', () => {
    if (dev) {
      main.showInactive();
    } else {
      main.show();
    }

    if (maximized) {
      main.maximize();
    }
  });
}
