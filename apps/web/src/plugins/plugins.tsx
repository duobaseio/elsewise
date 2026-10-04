import { useEffect, useLayoutEffect, useState } from 'react';
import { useBrightness } from '@/settings/settings';
import { PluginAppearance } from './appearance';
import { PluginLoader, usePlugins } from './loader';

/**
 * Loads the enabled plugins, and keeps the appearance they see in step with the application's.
 */
export function Plugins() {
  const installed = usePlugins((plugins) => plugins);
  const brightness = useBrightness();
  const [appearance] = useState(() => new PluginAppearance(brightness));
  const [loader] = useState(() => new PluginLoader(appearance));

  useLayoutEffect(() => {
    appearance.brightness = brightness;
  }, [appearance, brightness]);

  // TODO: Replace with lazy loading.
  useEffect(() => {
    for (const plugin of installed) {
      if (plugin.enabled) {
        void loader.load(plugin.id, plugin.url);
      }
    }
  }, [loader, installed]);

  return null;
}
