import { DEFAULT_SETTINGS_GROUPS, type SettingsPanel } from '@elsewise/plugin';
import { EDITOR_TERMS, Editor } from '@/routes/settings/appearance/editor';
import { GENERAL_TERMS, General } from '@/routes/settings/appearance/general';
import { TERMINAL_TERMS, Terminal } from '@/routes/settings/appearance/terminal';
import type { FileRouteTypes } from '@/routeTree.gen';

export const DEFAULT_PANELS = {
  general: {
    id: 'io.duobase.elsewise.settings.general',
    label: 'General',
    group: DEFAULT_SETTINGS_GROUPS.appearance,
    route: '/settings/appearance/general',
    terms: GENERAL_TERMS,
    component: General,
  },
  editor: {
    id: 'io.duobase.elsewise.settings.editor',
    label: 'Editor',
    group: DEFAULT_SETTINGS_GROUPS.appearance,
    route: '/settings/appearance/editor',
    terms: EDITOR_TERMS,
    component: Editor,
  },
  terminal: {
    id: 'io.duobase.elsewise.settings.terminal',
    label: 'Terminal',
    group: DEFAULT_SETTINGS_GROUPS.appearance,
    route: '/settings/appearance/terminal',
    terms: TERMINAL_TERMS,
    component: Terminal,
  },
} as const satisfies Record<string, SettingsPanel & { route: FileRouteTypes['to'] }>;

export function linkTo(
  panel: SettingsPanel,
): { to: FileRouteTypes['to']; params?: undefined } | { to: '/settings/plugins/$id'; params: { id: string } } {
  const route = Object.values(DEFAULT_PANELS).find((other) => other.id === panel.id)?.route;
  return route === undefined ? { to: '/settings/plugins/$id', params: { id: panel.id } } : { to: route };
}
