import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { StrictMode } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { WorkspaceSchema } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { ProjectManager } from '@/projects/project-manager';
import { workspacesQuery } from '@/projects/workspace-manager';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { builtInApplication } from '../../../../../../test/commands';
import { WORKSPACE } from '../../../../../../test/dock';
import { Route } from './route';

import 'dockview-react/dist/styles/dockview.css';

// Strict mode reruns the route's effects while its dockview stays mounted, as a hot reload does.
test('reattaches dock when effects rerun', async () => {
  const client = new QueryClient();
  client.setQueryData(workspacesQuery(WORKSPACE.daemon, WORKSPACE.project).queryKey, [
    create(WorkspaceSchema, { projectId: WORKSPACE.project, id: WORKSPACE.workspace, name: 'w' }),
  ]);
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: Route.options.component,
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([workspace])]),
    history: createMemoryHistory({
      initialEntries: [`/${WORKSPACE.daemon}/${WORKSPACE.project}/${WORKSPACE.workspace}`],
    }),
  });
  const application = builtInApplication({ router, projects: new ProjectManager(client, router) });

  await render(
    <StrictMode>
      <ApplicationManagerContext value={application}>
        <WorkspaceStateStoreContext value={new WorkspaceStateStore(undefined)}>
          <QueryClientProvider client={client}>
            <div style={{ width: 1100, height: 700 }}>
              <RouterProvider router={router} />
            </div>
          </QueryClientProvider>
        </WorkspaceStateStoreContext>
      </ApplicationManagerContext>
    </StrictMode>,
  );

  await vi.waitFor(() => expect(application.docks.active?.workspaceId).toEqual(WORKSPACE));
});
