import { Toaster } from '@elsewise/components/components/toast';
import { useQueryClient } from '@tanstack/react-query';
import { createRootRoute, Outlet, useRouter } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { useActiveTheme } from '@/appearance/themes';
import { ApplicationManagerContext } from '@/application-context';
import { ApplicationManager } from '@/application-manager';
import { installApplicationKeys, useSelectedKeymap } from '@/command/keymap/keymap';
import { FAKE_GIT } from '@/editor/diff/fake-diff';
import { EditorManager } from '@/editor/editor-manager';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { FileTreeManager } from '@/fs/file-tree-manager';
import { usePluginStore } from '@/plugins/plugin-store';
import { ProjectManager } from '@/projects/project-manager';
import { useWorkspaceStateStore } from '@/projects/workspace-state-store';
import { DEFAULT_PANELS } from '@/settings/default-panels';
import { DEFAULT_FONTS } from '@/settings/fonts';
import { useBrightness, useSettings } from '@/settings/settings';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';

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
  const plugins = usePluginStore();
  const brightness = useBrightness();
  const theme = useActiveTheme();
  const { keymap } = useSelectedKeymap();
  const frontend = useSettings();
  const router = useRouter();
  const client = useQueryClient();
  const workspaceStates = useWorkspaceStateStore();

  const [{ application, languageServers }] = useState(() => {
    const application = new ApplicationManager(
      new AppearanceManager(brightness, theme),
      router,
      new SettingsPanelManager(Object.values(DEFAULT_PANELS), frontend),
      new ProjectManager(client, router, workspaceStates),
      new EditorManager(),
      new TerminalManager(),
      new FileTreeManager(),
      keymap,
    );

    // TODO: Replace with actual diffs once git daemon is ready
    application.editor.diffs.add([FAKE_GIT]);

    return {
      application,
      languageServers: new LanguageServers(application.editor),
    };
  });
  const { appearance, commands, settings } = application;

  useCurrentTheme(appearance);
  useCurrentFonts();

  useEffect(() => {
    commands.selected = keymap;
  }, [commands, keymap]);

  useEffect(() => {
    settings.frontend = frontend;
  }, [settings, frontend]);

  useEffect(() => installApplicationKeys(window, commands), [commands]);

  useEffect(() => {
    void plugins.enableAll(application);
    return () => {
      void plugins.disableAll();
    };
  }, [plugins, application]);

  return (
    <ApplicationManagerContext value={application}>
      <LanguageServersContext value={languageServers}>
        <Toaster>
          <Outlet />
        </Toaster>
      </LanguageServersContext>
    </ApplicationManagerContext>
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
      { font: general, name: 'sans', text: 'base', fallback: "'Public Sans Variable', system-ui, sans-serif" },
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

    const features = DEFAULT_FONTS.find((choice) => choice.value === general.family)?.features;
    if (features) {
      style.setProperty('--font-sans-features', features);
    } else {
      style.removeProperty('--font-sans-features');
    }
  }, [general, editor]);
}
