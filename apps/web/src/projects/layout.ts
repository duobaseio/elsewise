import { DEFAULT_PROJECT_LAYOUT, type ProjectLayout } from '@elsewise/bridge';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { projectsQuery } from '@/projects/projects';
import { workspacesQuery } from '@/projects/workspaces';

type ProjectEntry = ProjectLayout['daemons'][string]['projects'][number];

/**
 * How the sidebar lays out each daemon's projects and their workspaces.
 */
export const projectLayoutQuery = queryOptions({
  queryKey: ['project-layout'],
  queryFn: async (): Promise<ProjectLayout> => (await window.bridge?.projects?.load()) ?? DEFAULT_PROJECT_LAYOUT,
  staleTime: 'static',
  gcTime: Number.POSITIVE_INFINITY,
});

/**
 * Returns the layout of the projects on the daemon with `daemonId`.
 */
export function useProjectLayout(daemonId: string) {
  const entries = useSuspenseQuery({
    ...projectLayoutQuery,
    select: (layout) => layout.daemons[daemonId]?.projects ?? [],
  }).data;

  return {
    projects: <T extends { id: string }>(projects: readonly T[]) =>
      ordered(
        projects,
        entries.map((entry) => entry.id),
      ),
    workspaces: <T extends { id: string }>(projectId: string, workspaces: readonly T[]) =>
      ordered(workspaces, entries.find((entry) => entry.id === projectId)?.workspaces ?? []),
    expanded: (projectId: string) => entries.find((entry) => entry.id === projectId)?.expanded ?? true,
  };
}

/**
 * Returns the functions that change the layout of the projects on the daemon with `daemonId`.
 */
export function useUpdateProjectLayout(daemonId: string) {
  const client = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: async (layout: ProjectLayout) => window.bridge?.projects?.save(layout),
    onError: (error: unknown) => {
      console.error('projects: save failed', error);
    },
  });

  // Applies `change` to the daemon's projects, each project shown listed first so the change keeps the order shown.
  const update = (change: (entries: ProjectEntry[]) => ProjectEntry[]) => {
    const next = client.setQueryData(projectLayoutQuery.queryKey, (layout) => {
      if (layout === undefined) {
        return layout;
      }

      const listed = layout.daemons[daemonId]?.projects ?? [];
      const shown = ordered(
        client.getQueryData(projectsQuery(daemonId).queryKey) ?? [],
        listed.map((entry) => entry.id),
      ).map(({ id }) => listed.find((entry) => entry.id === id) ?? { id, expanded: true, workspaces: [] });
      const entries = [...shown, ...listed.filter((entry) => !shown.some((other) => other.id === entry.id))];
      return { ...layout, daemons: { ...layout.daemons, [daemonId]: { projects: change(entries) } } };
    });
    if (next) {
      mutate(next);
    }
  };

  return {
    moveProject: (projectId: string, index: number) =>
      update((entries) => {
        const moved = entries.find((entry) => entry.id === projectId);
        if (moved === undefined) {
          return entries;
        }

        const others = entries.filter((entry) => entry !== moved);
        return [...others.slice(0, index), moved, ...others.slice(index)];
      }),
    moveWorkspace: (projectId: string, workspaceId: string, index: number) =>
      update((entries) =>
        entries.map((entry) => {
          if (entry.id !== projectId) {
            return entry;
          }

          const shown = ordered(
            client.getQueryData(workspacesQuery(daemonId, projectId).queryKey) ?? [],
            entry.workspaces,
          ).map(({ id }) => id);
          const workspaces = [...shown, ...entry.workspaces.filter((id) => !shown.includes(id))].filter(
            (id) => id !== workspaceId,
          );
          return { ...entry, workspaces: [...workspaces.slice(0, index), workspaceId, ...workspaces.slice(index)] };
        }),
      ),
    setExpanded: (projectId: string, expanded: boolean) =>
      update((entries) => entries.map((entry) => (entry.id === projectId ? { ...entry, expanded } : entry))),
    removeProject: (projectId: string) => update((entries) => entries.filter((entry) => entry.id !== projectId)),
    removeWorkspace: (projectId: string, workspaceId: string) =>
      update((entries) =>
        entries.map((entry) =>
          entry.id === projectId
            ? { ...entry, workspaces: entry.workspaces.filter((id) => id !== workspaceId) }
            : entry,
        ),
      ),
  };
}

function ordered<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const indexes = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (indexes.get(a.id) ?? ids.length) - (indexes.get(b.id) ?? ids.length));
}
