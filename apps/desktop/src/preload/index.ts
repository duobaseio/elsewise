// biome-ignore syntax/correctness/noTypeOnlyImportAttributes: Electron and JS's module system is a clusterfuck.
import type { PluginsBridge, WindowBridge } from '@elsewise/bridge' with { 'resolution-mode': 'import' };
import { contextBridge, ipcRenderer } from 'electron';

const plugins: PluginsBridge = {
  load: () => ipcRenderer.invoke('plugins:load'),
  save: (installed) => ipcRenderer.invoke('plugins:save', installed),
};

const window: WindowBridge = {
  getBackground: () => ipcRenderer.invoke('window:get-background'),
  setBackground: (color) => ipcRenderer.send('window:background', color),
};

contextBridge.exposeInMainWorld('bridge', {
  plugins,
  window,
});
