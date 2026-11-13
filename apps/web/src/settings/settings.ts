import {
  type ApplicationCommand,
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_FRONTEND_SETTINGS,
  DEFAULT_KEYS,
  DEFAULT_ROUTES,
  type EditorLanguageSettings,
  type FrontendSettings,
} from '@elsewise/frontend-plugin';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { LANGUAGES } from '@/settings/languages';

export const OPEN_SETTINGS: ApplicationCommand = {
  scope: 'application',
  id: DEFAULT_COMMANDS.application.settings.open,
  group: DEFAULT_COMMAND_GROUPS.application.id,
  label: 'Settings',
  defaultKeys: DEFAULT_KEYS.application.settings.open,
  run: ({ router }) => {
    if (!router.state.location.pathname.startsWith('/settings')) {
      void router.navigate({ to: DEFAULT_ROUTES.settings.last });
    }

    return true;
  },
};

/**
 * The application's settings.
 */
export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: async (): Promise<FrontendSettings> => (await window.bridge?.settings?.load()) ?? DEFAULT_FRONTEND_SETTINGS,
  staleTime: 'static',
  gcTime: Number.POSITIVE_INFINITY,
});

/**
 * Returns the settings.
 */
export function useSettings(): FrontendSettings;
export function useSettings<T>(select: (settings: FrontendSettings) => T): T;
export function useSettings<T>(select?: (settings: FrontendSettings) => T): FrontendSettings | T {
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
  return useSettings(({ editor }) => {
    const defaults: EditorLanguageSettings = editor;
    const overrides: Partial<EditorLanguageSettings> | undefined =
      name === undefined ? undefined : editor.languages[name];
    return overrides?.[key] ?? defaults[key];
  });
}

/**
 * Returns a function that applies `update` to the settings.
 */
export function useUpdateSettings(): (update: (settings: FrontendSettings) => FrontendSettings) => void {
  const client = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: async (next: FrontendSettings) => window.bridge?.settings?.save(next),
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

/**
 * Returns a function that merges `changes` into the settings' `section`.
 */
export function useUpdateSettingsSection<S extends keyof FrontendSettings>(
  section: S,
): (changes: Partial<FrontendSettings[S]>) => void {
  const update = useUpdateSettings();
  return (changes) => update((settings) => ({ ...settings, [section]: { ...settings[section], ...changes } }));
}

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/**
 * Returns the brightness.
 */
export function useBrightness(): 'light' | 'dark' {
  const brightness = useSettings((settings) => settings.appearance.brightness);
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
