import type {
  DaemonBridge,
  PluginsBridge,
  ProjectsBridge,
  SettingsBridge,
  WindowBridge,
  WorkspacesBridge,
} from '@elsewise/bridge';
import { contextBridge, ipcRenderer } from 'electron';

// The app's version from package.json, defined by bundle.mjs.
declare const ELSEWISE_VERSION: string;

const daemon: DaemonBridge = {
  connection: () => ipcRenderer.invoke('daemon:connection'),
};

const plugins: PluginsBridge = {
  load: (id?: string) => ipcRenderer.invoke('plugins:load', id),
  save: (installed) => ipcRenderer.invoke('plugins:save', installed),
};

const settings: SettingsBridge = {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (value) => ipcRenderer.invoke('settings:save', value),
  loadPlugin: (plugin) => ipcRenderer.invoke('settings:load-plugin', plugin),
  savePlugin: (plugin, value) => ipcRenderer.invoke('settings:save-plugin', plugin, value),
  loadUserThemes: () => ipcRenderer.invoke('settings:load-user-themes'),
  saveUserTheme: (id, theme) => ipcRenderer.invoke('settings:save-user-theme', id, theme),
  deleteUserTheme: (id) => ipcRenderer.invoke('settings:delete-user-theme', id),
  loadUserKeymaps: () => ipcRenderer.invoke('settings:load-user-keymaps'),
  saveUserKeymap: (id, keymap) => ipcRenderer.invoke('settings:save-user-keymap', id, keymap),
  deleteUserKeymap: (id) => ipcRenderer.invoke('settings:delete-user-keymap', id),
  onChange: (handler) => {
    ipcRenderer.on('settings:changed', (_event, changed) => handler(changed));
  },
};

const projects: ProjectsBridge = {
  load: () => ipcRenderer.invoke('projects:load'),
  save: (layout) => ipcRenderer.invoke('projects:save', layout),
};

const workspaces: WorkspacesBridge = {
  load: (workspace) => ipcRenderer.invoke('workspaces:load', workspace),
  save: (workspace, state) => ipcRenderer.invoke('workspaces:save', workspace, state),
  delete: (id) => ipcRenderer.invoke('workspaces:delete', id),
};

let close: (() => Promise<void>) | undefined;
ipcRenderer.on('window:close', async () => {
  try {
    if (close !== undefined) {
      await close();
    }
  } finally {
    ipcRenderer.send('window:closed');
  }
});

const window: WindowBridge = {
  cut: () => ipcRenderer.send('window:cut'),
  copy: () => ipcRenderer.send('window:copy'),
  paste: () => ipcRenderer.send('window:paste'),
  showPath: (absolutePath) => ipcRenderer.invoke('window:show-path', absolutePath),
  pickPaths: (options) => ipcRenderer.invoke('window:pick-paths', options),
  setBrightness: (brightness) => ipcRenderer.send('window:brightness', brightness),
  setBackground: (color) => ipcRenderer.send('window:background', color),
  onClose: (handler) => {
    close = handler;
  },
};

contextBridge.exposeInMainWorld('bridge', {
  version: ELSEWISE_VERSION,
  daemon,
  plugins,
  settings,
  projects,
  window,
  workspaces,
});
