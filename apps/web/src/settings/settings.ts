import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

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
 * Returns what `select` picks from the settings.
 */
export function useSettings<T>(select: (settings: Settings) => T): T {
  return useSuspenseQuery({ ...settingsQuery, select }).data;
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
