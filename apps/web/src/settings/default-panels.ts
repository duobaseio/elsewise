import type { LocalSettingsPanel, SettingsPanel } from '@elsewise/frontend-plugin';
import { APPEARANCE_TERMS, Appearance } from '@/routes/settings/local/appearance';
import { EDITOR_TERMS, Editor } from '@/routes/settings/local/editor';
import { FILE_TREE_TERMS, FileTree } from '@/routes/settings/local/file-tree';
import { KEYMAP_TERMS, Keymap } from '@/routes/settings/local/keymap';
import { TERMINAL_TERMS, Terminal } from '@/routes/settings/local/terminal';
import type { FileRouteTypes } from '@/routeTree.gen';

export const DEFAULT_PANELS = {
  appearance: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.appearance',
    label: 'Appearance',
    route: '/settings/local/appearance',
    terms: APPEARANCE_TERMS,
    component: Appearance,
  },
  keymap: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.keymap',
    label: 'Keymap',
    route: '/settings/local/keymap',
    terms: KEYMAP_TERMS,
    component: Keymap,
  },
  editor: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.editor',
    label: 'Editor',
    route: '/settings/local/editor',
    terms: EDITOR_TERMS,
    component: Editor,
  },
  fileTree: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.file-tree',
    label: 'File tree',
    route: '/settings/local/file-tree',
    terms: FILE_TREE_TERMS,
    component: FileTree,
  },
  terminal: {
    scope: 'local',
    id: 'io.duobase.elsewise.settings.terminal',
    label: 'Terminal',
    route: '/settings/local/terminal',
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
  | { to: '/settings/local/editor/$language'; params: { language: string } } {
  if (language !== undefined) {
    return { to: '/settings/local/editor/$language', params: { language } };
  }
  if (panel.scope === 'remote' && remote !== undefined) {
    return { to: '/settings/remote/$remote/$id', params: { remote, id: panel.id } };
  }

  const route = Object.values(DEFAULT_PANELS).find((other) => other.id === panel.id)?.route;
  return route === undefined ? { to: '/settings/local/$id', params: { id: panel.id } } : { to: route };
}
