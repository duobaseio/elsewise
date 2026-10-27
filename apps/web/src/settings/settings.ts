import { DEFAULT_SETTINGS, type EditorLanguageSettings, type Settings } from '@elsewise/bridge';
import { type ApplicationCommand, DEFAULT_COMMANDS, DEFAULT_KEYS, DEFAULT_ROUTES } from '@elsewise/plugin';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { LANGUAGES } from '@/settings/languages';

export const OPEN_SETTINGS: ApplicationCommand = {
  scope: 'application',
  id: DEFAULT_COMMANDS.application.settings.open,
  label: 'Settings',
  defaultKeys: DEFAULT_KEYS.application.settings.open,
  run: ({ router }) => {
    if (!router.state.location.pathname.startsWith('/settings')) {
      void router.navigate({ to: DEFAULT_ROUTES.settings.general });
    }

    return true;
  },
};

/**
 * The application's settings.
 */
export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: async (): Promise<Settings> => (await window.bridge?.settings?.load()) ?? DEFAULT_SETTINGS,
  staleTime: 'static',
  gcTime: Number.POSITIVE_INFINITY,
});

/**
 * Returns the settings.
 */
export function useSettings(): Settings;
export function useSettings<T>(select: (settings: Settings) => T): T;
export function useSettings<T>(select?: (settings: Settings) => T): Settings | T {
  return useSuspenseQuery({ ...settingsQuery, select }).data;
}

/**
 * Returns the override for `key` in `language`, or the editor's setting otherwise.
 *
 * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
 */
export function useEditorSettings<K extends keyof EditorLanguageSettings>(
  language: string | undefined,
  key: K,
): EditorLanguageSettings[K] {
  const name = language === undefined ? undefined : (LANGUAGES[language]?.name ?? language);
  return useSettings(({ appearance: { editor } }) => {
    const override = name === undefined ? undefined : editor.languages[name]?.[key];
    return override ?? editor[key];
  });
}

/**
 * Returns a function that applies `update` to the settings.
 */
export function useUpdateSettings(): (update: (settings: Settings) => Settings) => void {
  const client = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: async (next: Settings) => window.bridge?.settings?.save(next),
    onError: (error: unknown) => {
      console.error('settings: save failed', error);
    },
  });

  return (update) => {
    const next = client.setQueryData(settingsQuery.queryKey, (current) => current && update(current));
    if (next) {
      mutate(next);
    }
  };
}

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/**
 * Returns the brightness.
 */
export function useBrightness(): 'light' | 'dark' {
  const brightness = useSettings((settings) => settings.appearance.general.brightness);
  const systemDark = useSyncExternalStore(
    (onChange) => {
      const query = matchMedia(SYSTEM_DARK);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => matchMedia(SYSTEM_DARK).matches,
  );

  return brightness === 'system' ? (systemDark ? 'dark' : 'light') : brightness;
}
