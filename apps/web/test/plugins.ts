import type { InstalledPlugin, InvalidPlugin } from '@elsewise/bridge';
import { PluginStore } from '@/plugins/plugin-store';

// Returns a store that has loaded `plugins` through the bridge, which it then restores.
export async function pluginStore(plugins: readonly (InstalledPlugin | InvalidPlugin)[] = []): Promise<PluginStore> {
  function load(): Promise<(InstalledPlugin | InvalidPlugin)[]>;
  function load(id: string): Promise<InstalledPlugin | InvalidPlugin | undefined>;
  async function load(id?: string) {
    return id === undefined
      ? [...plugins]
      : plugins.find((plugin) => ('error' in plugin ? plugin.id : plugin.manifest.id) === id);
  }

  const bridge = window.bridge;
  window.bridge = { ...bridge, plugins: { load, save: async () => {} } };
  try {
    const store = new PluginStore();
    await store.loadAll();
    return store;
  } finally {
    window.bridge = bridge;
  }
}
