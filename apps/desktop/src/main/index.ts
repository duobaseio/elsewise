import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { dataLocalDir } from '@elsewise/core/node';
import type { Brightness, PickPathsOptions } from '@elsewise/frontend-plugin';
import { app, BrowserWindow, dialog, nativeTheme, protocol, shell } from 'electron';
import { handleDaemon } from './daemon';
import { installMenu } from './menu';
import { handlePlugins } from './plugins';
import { handleProjects } from './projects';
import { handleAppScheme } from './protocol';
import { handleSettings, watchUserThemesAndKeymaps } from './settings';
import { closeAfterRenderer, loadWindow, saveWindow } from './window';
import { handleWorkspaces } from './workspaces';

app.setName('Elsewise');
app.setPath('userData', path.join(dataLocalDir(), 'chromium'));

// A dev restart of an app that was not frontmost stays in the background. macOS activates an app as it launches, and a
// window cannot be shown behind another app's, so it launches as an accessory app, which is not activated, and shows
// its window once activated.
const devBackground = process.platform === 'darwin' && !!process.env.ELSEWISE_DEV_BACKGROUND;
if (devBackground) {
  app.setActivationPolicy('accessory');
}

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
  handleDaemon();
  handlePlugins();
  handleSettings();
  handleProjects();
  handleWorkspaces();

  installMenu();
  watchUserThemesAndKeymaps();

  createWindow(devBackground);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(false);
    }
  });
});

// Quits on a signal as the app menu would, e.g. when the dev runner stops or restarts Electron, so the renderer can
// disable its plugins first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => app.quit());
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function createWindow(background: boolean) {
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
  closeAfterRenderer(main);

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

  main.webContents.ipc.on('window:cut', (event) => event.sender.cut());
  main.webContents.ipc.on('window:copy', (event) => event.sender.copy());
  main.webContents.ipc.on('window:paste', (event) => event.sender.paste());
  main.webContents.ipc.handle('window:show-path', async (_event, absolutePath: string) => {
    if (!(await stat(absolutePath)).isDirectory()) {
      shell.showItemInFolder(absolutePath);
      return;
    }

    const error = await shell.openPath(absolutePath);
    if (error !== '') {
      throw new Error(error);
    }
  });
  main.webContents.ipc.handle('window:pick-paths', async (_event, options: PickPathsOptions = {}) => {
    const { kind = 'file', resolveAliases = true, addToRecent = true } = options;
    const { canceled, filePaths } = await dialog.showOpenDialog(main, {
      title: options.title,
      defaultPath: options.defaultPath,
      buttonLabel: options.buttonLabel,
      filters: options.filters,
      message: options.message,
      properties: (
        [
          kind !== 'folder' && 'openFile',
          kind !== 'file' && 'openDirectory',
          options.multiple && 'multiSelections',
          options.showHidden && 'showHiddenFiles',
          options.createFolder && 'createDirectory',
          options.promptToCreate && 'promptToCreate',
          !resolveAliases && 'noResolveAliases',
          options.openPackages && 'treatPackageAsDirectory',
          !addToRecent && 'dontAddToRecent',
        ] as const
      ).filter((property) => typeof property === 'string'),
    });
    if (canceled) {
      return [];
    }
    if (!resolveAliases) {
      return filePaths;
    }

    return Promise.all(
      filePaths.map((filePath) =>
        realpath(filePath).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            return filePath;
          }

          throw error;
        }),
      ),
    );
  });
  main.webContents.ipc.on(
    'window:brightness',
    (_event, brightness: Brightness) => (nativeTheme.themeSource = brightness),
  );
  main.webContents.ipc.on('window:background', (_event, color: string) => main.setBackgroundColor(color));
  main.webContents.ipc.once('window:background', () => {
    const show = () => {
      main.show();
      if (maximized) {
        main.maximize();
      }
    };

    if (background) {
      app.setActivationPolicy('regular');
      app.once('did-become-active', show);
    } else {
      show();
    }
  });
}
