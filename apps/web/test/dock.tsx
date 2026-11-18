import type { WorkspaceId } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { STUB_PANELS } from './dock-stubs';

import 'dockview-react/dist/styles/dockview.css';

export const WORKSPACE: WorkspaceId = { daemon: 'd', project: 'p', workspace: 'w' };

export const EDITOR = {
  id: 'editor:$workspace.tsx',
  type: 'editor',
  tab: true,
  closable: true,
  relativePath: 'apps/web/src/routes/_shell/$daemon/$project/$workspace.tsx',
} as const;
export const FILE_TREE = { id: 'fileTree', type: 'fileTree', tab: false, closable: false } as const;
export const TERMINAL = {
  id: 'terminal:1',
  type: 'terminal',
  tab: true,
  closable: true,
  session: { ...WORKSPACE, session: '1' },
} as const;

// Mounts a dock of stub panels, which has the editor beside the file tree.
export async function mount(onReady?: (dockview: DockviewApi) => void): Promise<DockviewApi> {
  let api: DockviewApi | undefined;
  await render(
    <div style={{ width: 1100, height: 700 }}>
      <WorkspaceDock
        panels={STUB_PANELS}
        onDockviewReady={(ready) => {
          api = ready;
          onReady?.(ready);
        }}
      />
    </div>,
  );
  await vi.waitFor(() => {
    if (api === undefined) {
      throw new Error('dock not ready');
    }
  });
  return api as DockviewApi;
}

// Adds the terminal below the editor.
export function addTerminal(dockview: DockviewApi) {
  return dockview.addPanel({
    id: TERMINAL.id,
    component: 'terminal',
    params: { session: TERMINAL.session.session },
    position: { referencePanel: EDITOR.id, direction: 'below' },
  });
}
