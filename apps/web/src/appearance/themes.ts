import { BundledTheme, type ThemeId } from '@elsewise/bridge';
import { type ResolvedTheme, Theme } from '@elsewise/plugin';
import { useMemo } from 'react';
import { useBrightness, useSettings } from '@/settings/settings';

export interface LoadedTheme {
  readonly id: ThemeId;
  readonly theme: Theme;
}

// TODO: add support for plugin themes.
export const THEMES: readonly LoadedTheme[] = Object.entries(
  import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' }),
).map(([path, content]) => ({
  id: { source: 'elsewise', name: BundledTheme.parse(path.slice('./bundled/'.length, -'.json'.length)) },
  theme: Theme.parse(content),
}));

/**
 * Returns the interface, editor, and terminal's theme for the current brightness.
 *
 * The editor and terminal fallback to the interface's theme if unspecified.
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
 * Resolves the `id`'s theme for the given `brightness` with unspecified colors defaulting to Elsewise's.
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
