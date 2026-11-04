import { create } from '@bufbuild/protobuf';
import type { ProjectLayout } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { LOCAL_DAEMON } from '@/daemon';
import { ProjectSchema, WorkspaceSchema } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { projectLayoutQuery, useProjectLayout, useUpdateProjectLayout } from '@/projects/layout';
import { projectsQuery } from '@/projects/project-manager';
import { workspacesQuery } from '@/projects/workspace-manager';

afterEach(() => {
  window.bridge = undefined;
});

const PROJECTS = ['a', 'b', 'c'].map((id) => create(ProjectSchema, { id }));
const WORKSPACES = ['x', 'y', 'z'].map((id) => create(WorkspaceSchema, { projectId: 'a', id }));

// Renders both hooks for the local daemon, with `layout` loaded and `PROJECTS` on the daemon, and returns what is saved.
async function mount(layout: ProjectLayout) {
  const saved: ProjectLayout[] = [];
  window.bridge = { projects: { load: async () => layout, save: async (next) => void saved.push(next) } };
  const client = new QueryClient();
  client.setQueryData(projectLayoutQuery.queryKey, layout);
  client.setQueryData(projectsQuery(LOCAL_DAEMON).queryKey, PROJECTS);
  client.setQueryData(workspacesQuery(LOCAL_DAEMON, 'a').queryKey, WORKSPACES);
  const { result } = await renderHook(
    () => ({ layout: useProjectLayout(LOCAL_DAEMON), update: useUpdateProjectLayout(LOCAL_DAEMON) }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { result, saved };
}

function ids(items: readonly { id: string }[]) {
  return items.map((item) => item.id);
}

describe('useProjectLayout', () => {
  test('lists unlisted projects last', async () => {
    const { result } = await mount({ daemons: { local: { projects: [{ id: 'c', expanded: true, workspaces: [] }] } } });

    expect(ids(result.current.layout.projects(PROJECTS))).toEqual(['c', 'a', 'b']);
  });

  test('expands unlisted projects', async () => {
    const { result } = await mount({ daemons: {} });

    expect(result.current.layout.expanded('a')).toBe(true);
  });
});

describe('useUpdateProjectLayout', () => {
  test('moves project', async () => {
    const { result, saved } = await mount({ daemons: {} });

    result.current.update.moveProject('c', 0);

    await vi.waitFor(() => expect(ids(result.current.layout.projects(PROJECTS))).toEqual(['c', 'a', 'b']));
    expect(saved.at(-1)?.daemons.local?.projects.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  test('collapses without reordering', async () => {
    const { result } = await mount({ daemons: {} });

    result.current.update.setExpanded('b', false);

    await vi.waitFor(() => expect(result.current.layout.expanded('b')).toBe(false));
    expect(ids(result.current.layout.projects(PROJECTS))).toEqual(['a', 'b', 'c']);
  });

  test('moves workspace', async () => {
    const { result } = await mount({ daemons: {} });

    result.current.update.moveWorkspace('a', 'z', 1);

    await vi.waitFor(() => expect(ids(result.current.layout.workspaces('a', WORKSPACES))).toEqual(['x', 'z', 'y']));
  });

  test('keeps projects missing from daemon', async () => {
    const { result, saved } = await mount({
      daemons: { local: { projects: [{ id: 'gone', expanded: false, workspaces: [] }] } },
    });

    result.current.update.moveProject('b', 0);

    await vi.waitFor(() =>
      expect(saved.at(-1)?.daemons.local?.projects.map((entry) => entry.id)).toEqual(['b', 'a', 'c', 'gone']),
    );
  });

  test('removes project', async () => {
    const { result, saved } = await mount({ daemons: {} });

    result.current.update.removeProject('a');

    await vi.waitFor(() => expect(saved.at(-1)?.daemons.local?.projects.map((entry) => entry.id)).toEqual(['b', 'c']));
  });
});
