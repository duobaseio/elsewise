import type {} from '@elsewise/bridge';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { PluginAppearance } from '@/plugins/appearance';
import { PluginLoader, usePlugins } from '@/plugins/loader';
import { useBrightness, useSettings } from '@/settings/settings';
import { useTheme } from '@/themes/themes';

import '../styles.css';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const installed = usePlugins((plugins) => plugins);
  const brightnessSetting = useSettings((settings) => settings.appearance.general.brightness);
  const brightness = useBrightness();
  const theme = useTheme();
  const editorFont = useSettings((settings) => settings.appearance.editor.font);
  const [appearance] = useState(() => new PluginAppearance(brightness, theme));
  const [loader] = useState(() => new PluginLoader(appearance));

  // Uses brightnessSetting instead of brightness to avoid a circular dependency.
  useLayoutEffect(() => {
    window.bridge?.window?.setBrightness(brightnessSetting);
  }, [brightnessSetting]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.brightness = brightness;
    for (const [name, color] of Object.entries(theme.interface)) {
      root.style.setProperty(`--${name}`, color);
    }
    window.bridge?.window?.setBackground(getComputedStyle(document.body).backgroundColor);

    // Ensures that their listeners find the page already in the new theme.
    appearance.theme = theme;
    appearance.brightness = brightness;
  }, [appearance, brightness, theme]);

  // TODO: apply all fonts.
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    if (editorFont.family === null) {
      style.removeProperty('--font-mono');
    } else if (editorFont.family === 'ui-monospace') {
      style.setProperty('--font-mono', 'ui-monospace, monospace');
    } else {
      style.setProperty('--font-mono', `${JSON.stringify(editorFont.family)}, 'JetBrains Mono Variable', monospace`);
    }
    style.setProperty('--text-code', `${editorFont.size}px`);
    style.setProperty('--font-mono-ligatures', editorFont.ligatures ? 'contextual' : 'none');
  }, [editorFont]);

  // TODO: Replace with lazy loading.
  useEffect(() => {
    for (const plugin of installed) {
      if (plugin.enabled) {
        void loader.load(plugin.id, plugin.url);
      }
    }
  }, [loader, installed]);

  return <Outlet />;
}
