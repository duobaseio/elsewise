import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Channel, createClient, WebSocketWire } from '@elsewise/transport';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { toProtocolPath } from '../src/fs/path';
import {
  FileSystemService,
  type WatchDirectoriesResponse,
} from '../src/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { ProjectService } from '../src/gen/elsewise/daemon/project/v1/project_service_pb';
import {
  type AttachTerminalResponse,
  TerminalService,
} from '../src/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { PROTOCOL, TOKEN_PREFIX } from '../src/websocket';
import { isolateGit } from './git/repo';
import { collect } from './harness';

const BUNDLE = path.join(import.meta.dirname, '../dist/daemon.mjs');
const TOKEN = 'bundle-test';

let root: string;
let daemon: ChildProcess;
let exited: Promise<unknown[]>;
let channel: Channel;

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-bundle-')));
  await isolateGit(root);
  const data = path.join(root, 'data');
  const code = path.join(root, 'code');
  await fs.mkdir(data);
  await fs.mkdir(code);

  const child = spawn(process.execPath, [BUNDLE], {
    env: { ...process.env, ELSEWISE_DAEMON_TOKEN: TOKEN, ELSEWISE_DAEMON_DATA: data, ELSEWISE_DAEMON_CODE: code },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  daemon = child;
  exited = once(child, 'exit');
  const [line] = await Promise.race([
    once(readline.createInterface({ input: child.stdout }), 'line'),
    exited.then(([exitCode, signal]) => {
      throw new Error(`the daemon exited with ${exitCode ?? signal} before listening`);
    }),
  ]);
  const { port } = JSON.parse(line);
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, [PROTOCOL, TOKEN_PREFIX + TOKEN]);
  channel = new Channel(await WebSocketWire.open(socket));
});

afterAll(async () => {
  channel?.close();
  daemon?.kill();
  await exited;
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10 });
});

describe('@lydell/node-pty', () => {
  test('runs a command in a terminal', async () => {
    const projects = createClient(channel, ProjectService);
    const terminals = createClient(channel, TerminalService);
    const { project } = await projects.createProject({
      source: { case: 'new', value: { name: 'Demo', absolutePath: '' } },
    });
    const { workspaces } = await projects.getWorkspaces({ projectId: project?.id ?? '' });
    const { terminal } = await terminals.createTerminal({ workspaceId: workspaces[0]?.id ?? '' });
    const terminalId = terminal?.id ?? '';

    const call = terminals.attachTerminal();
    const { seen } = collect(call.responses);
    void call.send({ event: { case: 'open', value: { terminalId, size: { columns: 80, rows: 24 } } } });
    void call.send({ event: { case: 'input', value: Buffer.from('echo hel""lo\r') } });
    await expect.poll(() => textOf(seen)).toContain('hello');

    call.cancel();
    await terminals.deleteTerminal({ terminalId });
  });
});

describe('@parcel/watcher', () => {
  test('reports a file written to a watched directory', async () => {
    const fileSystem = createClient(channel, FileSystemService);
    const watched = path.join(root, 'watched');
    await fs.mkdir(watched);

    const call = fileSystem.watchDirectories();
    const { seen } = collect(call.responses);
    await call.send({ root: toProtocolPath(watched), relativePaths: [''] });
    await expect.poll(() => namesOf(seen)).toEqual([]);

    await fs.writeFile(path.join(watched, 'a.txt'), '');
    await expect.poll(() => namesOf(seen)).toEqual(['a.txt']);
    call.cancel();
  });
});

function textOf(responses: AttachTerminalResponse[]): string {
  const chunks = responses.flatMap(({ event }) =>
    event.case === 'buffer' || event.case === 'output' ? [event.value] : [],
  );
  return Buffer.concat(chunks).toString();
}

function namesOf(responses: WatchDirectoriesResponse[]): string[] | undefined {
  const state = responses.at(-1)?.state;
  return state?.case === 'listing' ? state.value.entries.map((entry) => entry.name) : undefined;
}
