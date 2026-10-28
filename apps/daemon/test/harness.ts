import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DescService } from '@bufbuild/protobuf';
import { Channel, type Client, createClient, WebSocketWire } from '@elsewise/transport';
import { createDaemon, type Daemon, type DaemonOptions } from '../src/daemon';
import { type CodeDirectory, codeDirectory, type DataDirectory, dataDirectory } from '../src/directories';
import { toProtocolPath } from '../src/fs/path';
import { PROTOCOL, startWebSocketServer, TOKEN_PREFIX, type WebSocketServerHandle } from '../src/websocket';

const TOKEN = 'test-token';

/** A harness that starts the service with a client. */
export class Harness<S extends DescService> {
  /** A client of the service that is connected to the daemon. */
  readonly client: Client<S>;

  /** A fresh temporary directory as a protocol path. */
  readonly protocolRoot: string;

  /** A fresh temporary directory as a native path. */
  readonly nativeRoot: string;

  /** A fresh temporary daemon's data directory. */
  readonly data: DataDirectory;

  /** A fresh temporary daemon's code directory. */
  readonly code: CodeDirectory;

  private readonly daemon: Daemon;
  private readonly server: WebSocketServerHandle;
  private readonly channel: Channel;

  constructor(
    nativeRoot: string,
    data: DataDirectory,
    code: CodeDirectory,
    daemon: Daemon,
    server: WebSocketServerHandle,
    channel: Channel,
    client: Client<S>,
  ) {
    this.client = client;
    this.protocolRoot = toProtocolPath(nativeRoot);
    this.nativeRoot = nativeRoot;
    this.data = data;
    this.code = code;
    this.daemon = daemon;
    this.server = server;
    this.channel = channel;
  }

  /** Starts a daemon with the options and returns the harness. */
  protected static async connect<S extends DescService, T extends Harness<S>>(
    this: new (
      nativeRoot: string,
      data: DataDirectory,
      code: CodeDirectory,
      daemon: Daemon,
      server: WebSocketServerHandle,
      channel: Channel,
      client: Client<S>,
    ) => T,
    service: S,
    options: Omit<DaemonOptions, 'dataDirectory' | 'codeDirectory'>,
  ): Promise<T> {
    const nativeRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-daemon-')));
    const data = dataDirectory(await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-daemon-data-'))));
    const code = codeDirectory(await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-daemon-code-'))));
    const daemon = createDaemon({ dataDirectory: data.root, codeDirectory: code.root, ...options });
    const server = await startWebSocketServer(daemon, { port: 0, token: TOKEN });
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, [PROTOCOL, TOKEN_PREFIX + TOKEN]);
    const channel = new Channel(await WebSocketWire.open(socket));
    return new this(nativeRoot, data, code, daemon, server, channel, createClient(channel, service));
  }

  /** Returns the native path of an entry in the root. */
  nativeAt(...segments: string[]): string {
    return path.join(this.nativeRoot, ...segments);
  }

  /** Closes this harness. */
  async close(): Promise<void> {
    this.channel.close();
    await this.server.close();
    await this.daemon.close();
    // Windows may report EBUSY briefly.
    await fs.rm(this.nativeRoot, { recursive: true, force: true, maxRetries: 10 });
    await fs.rm(this.data.root, { recursive: true, force: true, maxRetries: 10 });
    await fs.rm(this.code.root, { recursive: true, force: true, maxRetries: 10 });
  }
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
