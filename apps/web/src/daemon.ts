import { Channel, type Client, createClient, WebSocketWire } from '@elsewise/transport';
import { queryOptions } from '@tanstack/react-query';
import { FileSystemService } from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { GitService } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { ProjectService } from '@/gen/elsewise/daemon/project/v1/project_service_pb';

/**
 * The daemon's services.
 */
export interface Daemon {
  readonly fileSystem: Client<typeof FileSystemService>;
  readonly git: Client<typeof GitService>;
  readonly projects: Client<typeof ProjectService>;
}

/**
 * The id of the daemon the desktop app runs on its own machine.
 */
export const LOCAL_DAEMON_ID = 'local';

/**
 * Returns the query for the connection to the daemon with `id`.
 */
// TODO: Reconnect when the channel closes. Requires transport changes.
export function daemonQuery(id: string) {
  return queryOptions({
    queryKey: ['daemons', id],
    queryFn: async (): Promise<Daemon> => {
      // TODO: Connect to remote daemons once remotes exist.
      const bridge = id === LOCAL_DAEMON_ID ? window.bridge?.daemon : undefined;
      if (bridge === undefined) {
        throw new Error(id === LOCAL_DAEMON_ID ? 'No daemon outside the desktop app.' : `No daemon ${id}.`);
      }

      const { port, token } = await bridge.connection();
      const socket = new WebSocket(`ws://127.0.0.1:${port}`, ['elsewise.daemon.v1', `elsewise.daemon.token.${token}`]);
      const channel = new Channel(await WebSocketWire.open(socket));
      return {
        fileSystem: createClient(channel, FileSystemService),
        git: createClient(channel, GitService),
        projects: createClient(channel, ProjectService),
      };
    },
    staleTime: 'static',
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
