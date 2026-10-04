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
  onOpen: (listener) => {
    const forward = () => listener();
    ipcRenderer.on('settings:open', forward);
    return () => {
      ipcRenderer.off('settings:open', forward);
    };
  },
};

const window: WindowBridge = {
  getBackground: () => ipcRenderer.invoke('window:get-background'),
  setBackground: (color) => ipcRenderer.send('window:background', color),
};

contextBridge.exposeInMainWorld('bridge', {
  plugins,
  settings,
  window,
});
