import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Channel, type Client, createClient, WebSocketWire } from '@elsewise/transport';
import { createDaemon } from '../../src/daemon';
import { toProtocolPath } from '../../src/fs/path';
import type { FileSystemOptions } from '../../src/fs/service';
import { FileSystemService } from '../../src/gen/elsewise/daemon/v1/file_system_service_pb';
import { PROTOCOL, startWebSocketServer, TOKEN_PREFIX } from '../../src/websocket';

const TOKEN = 'test-token';

export interface Harness {
  client: Client<typeof FileSystemService>;

  /** A fresh temporary directory as a `/`-separated path. */
  root: string;

  /** Returns the native path of an entry in the root. */
  at(...segments: string[]): string;

  close(): Promise<void>;
}

export async function startHarness(options?: Partial<FileSystemOptions>): Promise<Harness> {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-daemon-')));
  const server = await startWebSocketServer(createDaemon({ fileSystem: options }), { port: 0, token: TOKEN });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, [PROTOCOL, TOKEN_PREFIX + TOKEN]);
  const channel = new Channel(await WebSocketWire.open(socket));

  return {
    client: createClient(channel, FileSystemService),
    root: toProtocolPath(directory),
    at: (...segments) => path.join(directory, ...segments),
    async close() {
      channel.close();
      await server.close();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

/** Gathers a stream's responses as they arrive. */
export function collect<T>(responses: AsyncIterable<T>): { seen: T[]; ended: Promise<void> } {
  const seen: T[] = [];
  const ended = (async () => {
    for await (const response of responses) {
      seen.push(response);
    }
  })();
  ended.catch(() => {});
  return { seen, ended };
}
