import { DEFAULT_SETTINGS_GROUPS, type LocalSettingsPanel, type SettingsPanel } from '@elsewise/plugin';
import { EDITOR_TERMS, Editor } from '@/routes/settings/local/appearance/editor';
import { GENERAL_TERMS, General } from '@/routes/settings/local/appearance/general';
import { TERMINAL_TERMS, Terminal } from '@/routes/settings/local/appearance/terminal';
import type { FileRouteTypes } from '@/routeTree.gen';

export const DEFAULT_PANELS = {
  general: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.general',
    label: 'General',
    in: DEFAULT_SETTINGS_GROUPS.appearance,
    route: '/settings/local/appearance/general',
    terms: GENERAL_TERMS,
    component: General,
  },
  editor: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.editor',
    label: 'Editor',
    in: DEFAULT_SETTINGS_GROUPS.appearance,
    route: '/settings/local/appearance/editor',
    terms: EDITOR_TERMS,
    component: Editor,
  },
  terminal: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.terminal',
    label: 'Terminal',
    in: DEFAULT_SETTINGS_GROUPS.appearance,
    route: '/settings/local/appearance/terminal',
    terms: TERMINAL_TERMS,
    component: Terminal,
  },
} as const satisfies Record<string, LocalSettingsPanel & { route: FileRouteTypes['to'] }>;

/**
 * Returns the link to `panel` on `remote` if it is a remote panel, or to `language`'s page under the editor.
 */
export function linkTo(
  panel: SettingsPanel,
  { language, remote }: { language?: string; remote?: string } = {},
):
  | { to: FileRouteTypes['to']; params?: undefined }
  | { to: '/settings/local/$id'; params: { id: string } }
  | { to: '/settings/remote/$remote/$id'; params: { remote: string; id: string } }
  | { to: '/settings/local/appearance/editor/$language'; params: { language: string } } {
  if (language !== undefined) {
    return { to: '/settings/local/appearance/editor/$language', params: { language } };
  }
  if (panel.scope === 'remote' && remote !== undefined) {
    return { to: '/settings/remote/$remote/$id', params: { remote, id: panel.id } };
  }

  const route = Object.values(DEFAULT_PANELS).find((other) => other.id === panel.id)?.route;
  return route === undefined ? { to: '/settings/local/$id', params: { id: panel.id } } : { to: route };
}
