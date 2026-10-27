import { BundledTheme, type ThemeId } from '@elsewise/bridge';
import { type ActiveTheme, Theme } from '@elsewise/plugin';
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
export function useActiveTheme(): ActiveTheme {
  const general = useSettings((settings) => settings.appearance.general.theme);
  const editor = useSettings((settings) => settings.appearance.editor.theme);
  const terminal = useSettings((settings) => settings.appearance.terminal.theme);
  const brightness = useBrightness();

  return useMemo(
    () => ({
      interface: resolveActiveTheme(THEMES, general, brightness).interface,
      editor: resolveActiveTheme(THEMES, editor ?? general, brightness).editor,
      terminal: resolveActiveTheme(THEMES, terminal ?? general, brightness).terminal,
    }),
    [general, editor, terminal, brightness],
  );
}

/**
 * Resolves the `id`'s theme for the given `brightness` with unspecified colors defaulting to Elsewise's.
 */
export function resolveActiveTheme(
  themes: readonly LoadedTheme[],
  id: ThemeId,
  brightness: 'light' | 'dark',
): ActiveTheme {
  const elsewise = THEMES.find((loaded) => loaded.id.name === 'elsewise')?.theme[brightness];
  const variant = themes.find(
    ({ id: other }) =>
      other.source === id.source &&
      other.name === id.name &&
      (other.source !== 'plugin' || (id.source === 'plugin' && other.plugin === id.plugin)),
  )?.theme[brightness];

  const colors = { ...elsewise?.interface, ...variant?.interface };
  const editor = { ...elsewise?.editor, ...variant?.editor };
  // Elsewise's own diff colors apply only when its variant is the one in use, e.g. for an unknown theme.
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
