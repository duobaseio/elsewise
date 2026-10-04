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
  const brightness = useBrightness();
  const theme = useTheme();
  const editorFont = useSettings((settings) => settings.appearance.editor.font);
  const [appearance] = useState(() => new PluginAppearance(brightness, theme));
  const [loader] = useState(() => new PluginLoader(appearance));

  // Applies the theme before paint. The desktop keeps its window hidden until the page first reports its background,
  // so the window never flashes a color the page does not paint, and follows it on every change after.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.brightness = brightness;
    for (const [name, color] of Object.entries(theme.interface)) {
      root.style.setProperty(`--${name}`, color);
    }
    window.bridge?.window?.setBackground(getComputedStyle(document.body).backgroundColor);

    // The plugins last, so their listeners find the page already in the new theme. The theme before the brightness,
    // so a brightness listener reads the theme under the new brightness.
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
