import { BundledTheme, type ThemeId } from '@elsewise/bridge';
import { type ActiveTheme, Theme } from '@elsewise/plugin';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { usePluginStore } from '@/plugins/plugin-store';
import { useBrightness, useSettings } from '@/settings/settings';

export interface LoadedTheme {
  readonly id: ThemeId;
  readonly theme: Theme;
}

const BUNDLED_THEMES: readonly LoadedTheme[] = Object.entries(
  import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' }),
).map(([path, content]) => ({
  id: { source: 'elsewise', id: BundledTheme.parse(path.slice('./bundled/'.length, -'.json'.length)) },
  theme: Theme.parse(content),
}));

/**
 * The user's themes, and the ones that could not be read, which it logs.
 */
export const userThemesQuery = queryOptions({
  queryKey: ['user-themes'],
  queryFn: async () => {
    const themes = (await window.bridge?.settings?.loadUserThemes()) ?? [];
    for (const theme of themes) {
      if ('error' in theme) {
        console.error(`Theme ${theme.id} failed to load: ${theme.error}`);
      }
    }
    return themes;
  },
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
});

/**
 * Returns Elsewise's themes, then the user's and the enabled plugins', leaving out the ones that could not be read.
 */
export function useLoadedThemes(): readonly LoadedTheme[] {
  const plugins = usePluginStore((store) => store.plugins);
  const user = useSuspenseQuery(userThemesQuery).data;

  return useMemo(
    () => [
      ...BUNDLED_THEMES,
      ...user.flatMap((entry): LoadedTheme[] =>
        'error' in entry ? [] : [{ id: { source: 'user', id: entry.id }, theme: entry.theme }],
      ),
      ...plugins.flatMap((plugin) =>
        plugin.status === 'enabled'
          ? plugin.themes.map(
              ({ id, theme }): LoadedTheme => ({ id: { source: 'plugin', plugin: plugin.id, id }, theme }),
            )
          : [],
      ),
    ],
    [plugins, user],
  );
}

/**
 * Returns the interface, editor, and terminal's theme for the current brightness.
 *
 * The editor and terminal fallback to the interface's theme if unspecified.
 */
export function useActiveTheme(): ActiveTheme {
  const general = useSettings((settings) => settings.appearance.general.theme);
  const editor = useSettings((settings) => settings.appearance.editor.theme);
  const terminal = useSettings((settings) => settings.appearance.terminal.theme);
  const brightness = useBrightness();
  const themes = useLoadedThemes();

  // Fuck JS/TS's lack of list structural equality
  const find = (id: ThemeId) => themes.find((other) => sameTheme(other.id, id))?.theme;
  const generalTheme = find(general);
  const editorTheme = (editor === null ? undefined : find(editor)) ?? generalTheme;
  const terminalTheme = (terminal === null ? undefined : find(terminal)) ?? generalTheme;

  return useMemo(
    () => ({
      interface: resolveActiveTheme(generalTheme, brightness).interface,
      editor: resolveActiveTheme(editorTheme, brightness).editor,
      terminal: resolveActiveTheme(terminalTheme, brightness).terminal,
    }),
    [generalTheme, editorTheme, terminalTheme, brightness],
  );
}

/**
 * Resolves `theme` for the given `brightness` with unspecified colors defaulting to Elsewise's, or Elsewise's theme
 * without one.
 */
export function resolveActiveTheme(theme: Theme | undefined, brightness: 'light' | 'dark'): ActiveTheme {
  const elsewise = BUNDLED_THEMES.find((loaded) => loaded.id.id === 'elsewise')?.theme[brightness];
  const variant = theme?.[brightness];

  const colors = { ...elsewise?.interface, ...variant?.interface };
  const editor = { ...elsewise?.editor, ...variant?.editor };
  // Elsewise's own diff colors apply only when its variant is the one in use, e.g. without a theme.
  const diff = (variant ?? elsewise)?.editor.diff;
  return {
    interface: colors,
    editor: {
      ...editor,
      scrollbarMarkers: {
        error: colors.error,
        warning: colors['warning-fill'],
        info: colors.info,
        hint: colors.disabled,
        searchMatch: editor.searchMatch,
        usage: colors['info-line'],
        ...variant?.editor.scrollbarMarkers,
      },
      diff: {
        addedLine: colors['success-wash'],
        addedText: colors['success-line'],
        addedGutter: colors['success-line'],
        deletedLine: colors['error-wash'],
        deletedText: colors['error-line'],
        deletedGutter: colors['error-line'],
        ...diff,
      },
      tokens: { ...elsewise?.editor.tokens, ...variant?.editor.tokens },
    },
    terminal: { ...elsewise?.terminal, ...variant?.terminal },
  } as ActiveTheme;
}

export function sameTheme(a: ThemeId, b: ThemeId): boolean {
  return a.source === 'plugin'
    ? b.source === 'plugin' && a.plugin === b.plugin && a.id === b.id
    : b.source === a.source && a.id === b.id;
}
