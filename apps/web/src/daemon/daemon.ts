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
 * The connection to the daemon.
 */
// TODO: Reconnect when the channel closes. Requires transport changes.
export const daemonQuery = queryOptions({
  queryKey: ['daemon'],
  queryFn: async (): Promise<Daemon> => {
    const bridge = window.bridge?.daemon;
    if (bridge === undefined) {
      throw new Error('No daemon outside the desktop app.');
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
