import type { ThemeId } from '@elsewise/bridge';
import { type ResolvedTheme, Theme } from '@elsewise/plugin';
import { useMemo } from 'react';
import { useBrightness, useSettings } from '@/settings/settings';

/**
 * A theme, and the id that selects it.
 */
export interface LoadedTheme {
  readonly id: ThemeId;
  readonly theme: Theme;
}

/**
 * Every theme.
 *
 * TODO: add support for plugin themes.
 */
export const THEMES: readonly LoadedTheme[] = Object.entries(
  import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' }),
).map(([path, content]) => ({
  id: { source: 'elsewise', name: path.slice('./bundled/'.length, -'.json'.length) },
  theme: Theme.parse(content),
}));

/**
 * Returns the colors of the interface, editor and terminal, each under its selected theme and the brightness.
 *
 * The editor and the terminal follow the interface's theme unless they select their own.
 */
export function useTheme(): ResolvedTheme {
  const general = useSettings((settings) => settings.appearance.general.theme);
  const editor = useSettings((settings) => settings.appearance.editor.theme);
  const terminal = useSettings((settings) => settings.appearance.terminal.theme);
  const brightness = useBrightness();

  return useMemo(
    () => ({
      interface: resolveTheme(THEMES, general, brightness).interface,
      editor: resolveTheme(THEMES, editor ?? general, brightness).editor,
      terminal: resolveTheme(THEMES, terminal ?? general, brightness).terminal,
    }),
    [general, editor, terminal, brightness],
  );
}

/**
 * Returns the colors of the theme with `id` under `brightness`.
 *
 * Each color the theme leaves unspecified is Elsewise's.
 */
export function resolveTheme(themes: readonly LoadedTheme[], id: ThemeId, brightness: 'light' | 'dark'): ResolvedTheme {
  const elsewise = THEMES.find((loaded) => loaded.id.name === 'elsewise')?.theme[brightness];
  const variant = themes.find(
      ({ id: other }) =>
          other.source === id.source &&
          other.name === id.name &&
          (other.source !== 'plugin' || (id.source === 'plugin' && other.plugin === id.plugin)),
  )?.theme[brightness];

  return {
    interface: { ...elsewise?.interface, ...variant?.interface },
    editor: {
      ...elsewise?.editor,
      ...variant?.editor,
      tokens: { ...elsewise?.editor.tokens, ...variant?.editor.tokens },
    },
    terminal: { ...elsewise?.terminal, ...variant?.terminal },
  } as ResolvedTheme;
}
