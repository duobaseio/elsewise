import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { dataLocalDir } from './fs';
import { installMenu } from './menu';
import { loadWindow, saveWindow } from './window';

app.setName('Elsewise');
app.setPath('userData', path.join(dataLocalDir(), 'chromium'));

const createWindow = (): void => {
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
    void main.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Without this, a link the renderer opens (a terminal URL) becomes a bare BrowserWindow.
  main.webContents.setWindowOpenHandler(({ url }) => {
    const protocol = URL.parse(url)?.protocol;
    if (protocol === 'http:' || protocol === 'https:') {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });
  main.webContents.ipc.handle('window:get-background', () => main.getBackgroundColor());
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
};

app.whenReady().then(() => {
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
