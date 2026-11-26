import { create } from '@bufbuild/protobuf';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { DockviewApi } from 'dockview-react';
import { vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { WorkspaceSchema } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { workspacesQuery } from '@/projects/workspace-manager';
import { WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { builtInApplication } from './commands';

import 'dockview-react/dist/styles/dockview.css';

export const WORKSPACE: WorkspaceId = { daemon: 'd', project: 'p', workspace: 'w' };

export const FILE = {
  id: 'file:$workspace.tsx',
  type: 'file',
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
  closeConfirmation: false,
} as const;

// A query client that has the workspace, and a router that can show it.
export function workspaceRouter() {
  const client = new QueryClient();
  client.setQueryData(workspacesQuery(WORKSPACE.daemon, WORKSPACE.project).queryKey, [
    create(WorkspaceSchema, { projectId: WORKSPACE.project, id: WORKSPACE.workspace, name: 'w' }),
  ]);
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/$daemon/$project/$workspace' })]),
    history: createMemoryHistory(),
  });
  return { client, router };
}

export async function showWorkspace(router: AnyRouter) {
  await router.navigate({ to: `/${WORKSPACE.daemon}/${WORKSPACE.project}/${WORKSPACE.workspace}` });
  await router.load();
}

// Adds the file in place of the placeholder, beside the file tree of a new dock.
export function addFile(dockview: DockviewApi) {
  dockview.addPanel({
    id: FILE.id,
    component: 'file',
    title: '$workspace.tsx',
    params: { path: FILE.relativePath },
    position: { referencePanel: 'placeholder' },
    minimumWidth: 10,
    minimumHeight: 10,
  });
  dockview.getPanel('placeholder')?.api.close();
}

// Mounts a dock of stub panels, which has the file beside the file tree.
export async function mount(onReady?: (dockview: DockviewApi) => void): Promise<DockviewApi> {
  let api: DockviewApi | undefined;
  await render(
    <ApplicationManagerContext value={builtInApplication()}>
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          onDockviewReady={(ready) => {
            addFile(ready);
            api = ready;
            onReady?.(ready);
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => {
    if (api === undefined) {
      throw new Error('dock not ready');
    }
  });
  return api as DockviewApi;
}

// Adds the terminal below the file.
export function addTerminal(dockview: DockviewApi) {
  return dockview.addPanel({
    id: TERMINAL.id,
    component: 'terminal',
    params: { session: TERMINAL.session.session },
    position: { referencePanel: FILE.id, direction: 'below' },
  });
}
