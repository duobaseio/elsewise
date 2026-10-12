import type {} from '@elsewise/bridge';
import { Toaster } from '@elsewise/components/components/toast';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { useTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { PluginLoader, usePlugins } from '@/plugins/loader';
import { useBrightness, useSettings } from '@/settings/settings';

import '../styles.css';

export const Route = createRootRoute({
  component: RootComponent,
});

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'math',
  'emoji',
  'fangsong',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);

function RootComponent() {
  const installed = usePlugins();
  const brightness = useBrightness();
  const theme = useTheme();

  const [{ appearance, editor, commands, languageServers, loader }] = useState(() => {
    const appearance = new AppearanceManager(brightness, theme);
    const editor = new EditorManager();
    const commands = new CommandManager(appearance, editor);
    return {
      appearance,
      editor,
      commands,
      languageServers: new LanguageServers(editor),
      loader: new PluginLoader(commands.application),
    };
  });

  useCurrentTheme(appearance);
  useCurrentFonts();

  // TODO: Replace with lazy loading.
  useEffect(() => {
    for (const plugin of installed) {
      if (plugin.enabled) {
        void loader.load(plugin.id, plugin.url);
      }
    }
  }, [loader, installed]);

  return (
    <EditorManagerContext value={editor}>
      <CommandManagerContext value={commands}>
        <LanguageServersContext value={languageServers}>
          <Toaster>
            <Outlet />
          </Toaster>
        </LanguageServersContext>
      </CommandManagerContext>
    </EditorManagerContext>
  );
}

/**
 * Applies the brightness and the interface's theme.
 */
function useCurrentTheme(appearance: AppearanceManager) {
  const brightnessSetting = useSettings((settings) => settings.appearance.general.brightness);
  const brightness = useBrightness();
  const theme = useTheme();

  // Uses brightnessSetting instead of brightness to avoid a circular dependency.
  useLayoutEffect(() => window.bridge?.window?.setBrightness(brightnessSetting), [brightnessSetting]);

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
}

/**
 * Applies the interface's and editor's fonts.
 */
function useCurrentFonts() {
  const general = useSettings((settings) => settings.appearance.general.font);
  const editor = useSettings((settings) => settings.appearance.editor.font);

  useLayoutEffect(() => {
    const style = document.documentElement.style;
    const fonts = [
      { font: general, name: 'sans', text: 'base', fallback: "'Work Sans Variable', system-ui, sans-serif" },
      { font: editor, name: 'mono', text: 'code', fallback: "'JetBrains Mono Variable', monospace" },
    ];
    for (const { font, name, text, fallback } of fonts) {
      if (font.family === null) {
        style.removeProperty(`--font-${name}`);
      } else {
        // Generic family is a keyword, quoting it turns it into an installed font.
        const family = GENERIC_FAMILIES.has(font.family) ? font.family : JSON.stringify(font.family);
        style.setProperty(`--font-${name}`, `${family}, ${fallback}`);
      }

      style.setProperty(`--text-${text}`, `${font.size}px`);
      style.setProperty(`--font-${name}-ligatures`, font.ligatures ? 'contextual' : 'none');
    }
  }, [general, editor]);
}
