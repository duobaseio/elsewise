import type { InstalledFrontendPlugin } from '@elsewise/bridge';
import type { InvalidPlugin } from '@elsewise/core';
import { PluginStore } from '@/plugins/plugin-store';

// Returns a store that has loaded `plugins` through the bridge, which it then restores.
export async function pluginStore(
  plugins: readonly (InstalledFrontendPlugin | InvalidPlugin)[] = [],
): Promise<PluginStore> {
  function load(): Promise<(InstalledFrontendPlugin | InvalidPlugin)[]>;
  function load(id: string): Promise<InstalledFrontendPlugin | InvalidPlugin | undefined>;
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
