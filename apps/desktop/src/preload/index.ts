import type { PluginsBridge, SettingsBridge, WindowBridge } from '@elsewise/bridge';
import { contextBridge, ipcRenderer } from 'electron';

const plugins: PluginsBridge = {
  load: () => ipcRenderer.invoke('plugins:load'),
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
};

const window: WindowBridge = {
  cut: () => ipcRenderer.send('window:cut'),
  copy: () => ipcRenderer.send('window:copy'),
  paste: () => ipcRenderer.send('window:paste'),
  setBrightness: (brightness) => ipcRenderer.send('window:brightness', brightness),
  setBackground: (color) => ipcRenderer.send('window:background', color),
};

contextBridge.exposeInMainWorld('bridge', {
  plugins,
  settings,
  window,
});
