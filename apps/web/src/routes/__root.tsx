import { Toaster } from '@elsewise/components/components/toast';
import { createRootRoute, Outlet, useRouter } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { useActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { installApplicationKeys, useKeymap } from '@/command/keymap';
import { FAKE_BRANCH, FAKE_UNCOMMITTED, FAKE_UNSTAGED } from '@/editor/diff/fake-diff';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { PluginLoader, usePlugins } from '@/plugins/loader';
import { DEFAULT_PANELS } from '@/settings/default-panels';
import { useBrightness, useSettings } from '@/settings/settings';
import { SettingsPanelManager, SettingsPanelManagerContext } from '@/settings/settings-panel-manager';

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
  const theme = useActiveTheme();
  const keymap = useKeymap();
  const router = useRouter();

  const [{ appearance, commands, editor, settings, languageServers, loader }] = useState(() => {
    const appearance = new AppearanceManager(brightness, theme);
    const editor = new EditorManager();
    const settings = new SettingsPanelManager(Object.values(DEFAULT_PANELS));
    const commands = new CommandManager({ appearance, editor, router, settings });

    // TODO: Replace with actual diffs once git daemon is ready
    editor.diffs.add([FAKE_UNSTAGED, FAKE_UNCOMMITTED, FAKE_BRANCH]);

    return {
      appearance,
      commands,
      editor,
      settings,
      languageServers: new LanguageServers(editor),
      loader: new PluginLoader(appearance, commands),
    };
  });

  useCurrentTheme(appearance);
  useCurrentFonts();

  useEffect(() => {
    commands.selected = keymap;
  }, [commands, keymap]);

  useEffect(() => installApplicationKeys(window, commands), [commands]);

  useEffect(() => {
    void (async () => {
      const id = (plugin: (typeof installed)[number]) => ('error' in plugin ? plugin.id : plugin.manifest.id);
      for (const plugin of installed
        .filter((plugin) => plugin.enabled)
        .toSorted((a, b) => id(a).localeCompare(id(b)))) {
        if ('error' in plugin) {
          console.error(`Plugin ${plugin.id} failed to load: ${plugin.error}`);
        } else {
          await loader.load(plugin.manifest.id, plugin.url);
        }
      }
    })();
  }, [loader, installed]);

  return (
    <EditorManagerContext value={editor}>
      <CommandManagerContext value={commands}>
        <SettingsPanelManagerContext value={settings}>
          <LanguageServersContext value={languageServers}>
            <Toaster>
              <Outlet />
            </Toaster>
          </LanguageServersContext>
        </SettingsPanelManagerContext>
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
  const theme = useActiveTheme();

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
      if ('lineHeight' in font) {
        // The gutter shares the editor's line grid.
        const grid = `round(calc(var(--text-${text}) * ${font.lineHeight}), 1px)`;
        style.setProperty(`--text-${text}--line-height`, grid);
        style.setProperty(`--text-${text}-gutter--line-height`, grid);
      }
      style.setProperty(`--font-${name}-ligatures`, font.ligatures ? 'contextual' : 'none');
    }
  }, [general, editor]);
}
