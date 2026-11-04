import type { MessageInitShape } from '@bufbuild/protobuf';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { daemonQuery } from '@/daemon';
import type { Progress } from '@/gen/elsewise/daemon/git/v1/git_pb';
import type {
  CloneProjectRequestSchema,
  CreateProjectRequestSchema,
  DeleteProjectRequestSchema,
  UpdateProjectRequestSchema,
} from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { useUpdateProjectLayout } from '@/projects/layout';
import { workspacesQuery } from '@/projects/workspaces';

/**
 * Returns the query for every project on the daemon with `daemonId`.
 */
export function projectsQuery(daemonId: string) {
  return queryOptions({
    queryKey: ['daemons', daemonId, 'projects'],
    queryFn: async ({ client }) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.getProjects({})).projects;
    },
  });
}

/**
 * Returns the mutation that creates a project on the daemon with `daemonId`, and resolves to it.
 */
export function useCreateProject(daemonId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: MessageInitShape<typeof CreateProjectRequestSchema>) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.createProject(request)).project;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: projectsQuery(daemonId).queryKey, exact: true }),
  });
}

/**
 * Returns the mutation that clones a repository into a project on the daemon with `daemonId`, and resolves to it,
 * along with:
 * * `progress`: the clone's progress while it runs, or null.
 * * `cancel`: cancels the clone, which removes the folder and rejects with a CANCELLED `TransportError`.
 */
export function useCloneProject(daemonId: string) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<Progress | null>(null);
  const controller = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: async (request: MessageInitShape<typeof CloneProjectRequestSchema>) => {
      const daemon = await client.query(daemonQuery(daemonId));
      const abort = new AbortController();
      controller.current = abort;
      try {
        for await (const { event } of daemon.projects.cloneProject(request, { signal: abort.signal })) {
          if (event.case === 'progress') {
            setProgress(event.value);
          } else if (event.case === 'project') {
            return event.value;
          }
        }
        throw new Error('The clone ended without a project.');
      } finally {
        controller.current = null;
        setProgress(null);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: projectsQuery(daemonId).queryKey, exact: true }),
  });

  return { ...mutation, progress, cancel: () => controller.current?.abort() };
}

/**
 * Returns the mutation that updates a project on the daemon with `daemonId`, and resolves to it.
 */
export function useUpdateProject(daemonId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: MessageInitShape<typeof UpdateProjectRequestSchema>) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.updateProject(request)).project;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: projectsQuery(daemonId).queryKey, exact: true }),
  });
}

/**
 * Returns the mutation that deletes a project on the daemon with `daemonId`, and removes it from the layout.
 */
export function useDeleteProject(daemonId: string) {
  const client = useQueryClient();
  const { removeProject } = useUpdateProjectLayout(daemonId);
  return useMutation({
    mutationFn: async (request: MessageInitShape<typeof DeleteProjectRequestSchema>) => {
      const daemon = await client.query(daemonQuery(daemonId));
      await daemon.projects.deleteProject(request);
    },
    onSuccess: (_, { projectId = '' }) => {
      removeProject(projectId);
      client.removeQueries({ queryKey: workspacesQuery(daemonId, projectId).queryKey });
      return client.invalidateQueries({ queryKey: projectsQuery(daemonId).queryKey, exact: true });
    },
  });
}
