import type { Plugin, PluginInfo } from '@elsewise/daemon-plugin';

export default function ({ id }: PluginInfo): Plugin {
  return {
    onEnable() {
      console.error(`[${id}] Hello from the starter plugin`);
      return [() => console.error(`[${id}] Goodbye`)];
    },
  };
}
