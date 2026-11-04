import type { MessageInitShape } from '@bufbuild/protobuf';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { daemonQuery } from '@/daemon';
import type {
  CreateWorkspaceRequestSchema,
  DeleteWorkspaceRequestSchema,
  UpdateWorkspaceRequestSchema,
} from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { useUpdateProjectLayout } from '@/projects/layout';

/**
 * Returns the query for the workspaces of the project with `projectId` on the daemon with `daemonId`, the main one
 * first.
 */
export function workspacesQuery(daemonId: string, projectId: string) {
  return queryOptions({
    queryKey: ['daemons', daemonId, 'projects', projectId, 'workspaces'],
    queryFn: async ({ client }) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.getWorkspaces({ projectId })).workspaces;
    },
  });
}

/**
 * Returns the mutation that creates a workspace on the daemon with `daemonId`, and resolves to it.
 */
export function useCreateWorkspace(daemonId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: MessageInitShape<typeof CreateWorkspaceRequestSchema>) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.createWorkspace(request)).workspace;
    },
    onSuccess: (_, { projectId = '' }) => client.invalidateQueries(workspacesQuery(daemonId, projectId)),
  });
}

/**
 * Returns the mutation that updates a workspace on the daemon with `daemonId`, and resolves to it.
 */
export function useUpdateWorkspace(daemonId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: MessageInitShape<typeof UpdateWorkspaceRequestSchema>) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.updateWorkspace(request)).workspace;
    },
    onSuccess: (_, { projectId = '' }) => client.invalidateQueries(workspacesQuery(daemonId, projectId)),
  });
}

/**
 * Returns the mutation that deletes a workspace on the daemon with `daemonId`, and removes it from the layout.
 */
export function useDeleteWorkspace(daemonId: string) {
  const client = useQueryClient();
  const { removeWorkspace } = useUpdateProjectLayout(daemonId);
  return useMutation({
    mutationFn: async (request: MessageInitShape<typeof DeleteWorkspaceRequestSchema>) => {
      const daemon = await client.query(daemonQuery(daemonId));
      await daemon.projects.deleteWorkspace(request);
    },
    onSuccess: (_, { projectId = '', workspaceId = '' }) => {
      removeWorkspace(projectId, workspaceId);
      return client.invalidateQueries(workspacesQuery(daemonId, projectId));
    },
  });
}
