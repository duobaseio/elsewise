import { Code } from '@elsewise/transport';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type {
  AttachTerminalResponse,
  ExecResponse,
  Terminal,
} from '../../src/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { collect } from '../harness';
import { TerminalHarness } from './harness';

const SIZE = { columns: 80, rows: 24 };

let harness: TerminalHarness;
let workspaceId: string;

beforeEach(async () => {
  harness = await TerminalHarness.start({ saveDelayMs: 50 });
  workspaceId = (await harness.workspace()).id;
});

afterEach(async () => {
  await harness.close();
});

async function create(name = ''): Promise<Terminal> {
  const { terminal } = await harness.client.createTerminal({ workspaceId, name });
  return terminal as Terminal;
}

async function getTerminals(workspace = workspaceId): Promise<Terminal[]> {
  return (await harness.client.getTerminals({ workspaceId: workspace })).terminals;
}

/** Attaches to the terminal and gathers what arrives. */
function attach(terminalId: string, size: typeof SIZE | null = SIZE) {
  const call = harness.client.attachTerminal();
  const { seen, ended } = collect(call.responses);
  void call.send({ event: { case: 'open', value: { terminalId, size: size ?? undefined } } });
  return {
    seen,
    ended,
    type: (input: string) => void call.send({ event: { case: 'input', value: Buffer.from(input) } }),
    resize: (columns: number, rows: number) => void call.send({ event: { case: 'resize', value: { columns, rows } } }),
    cancel: () => call.cancel(),
    events: () => seen.map((response) => response.event.case),
    sizes: () => seen.flatMap(({ event }) => (event.case === 'size' ? [event.value] : [])),
    clients: () => seen.flatMap(({ event }) => (event.case === 'clients' ? [event.value] : [])),
    text: () => textOf(seen),
    buffer: () => textOf(seen.filter((response) => response.event.case === 'buffer')),
    exit: () => seen.find((response) => response.event.case === 'exit')?.event.value,
  };
}

function textOf(responses: AttachTerminalResponse[]): string {
  const chunks = responses.flatMap(({ event }) =>
    event.case === 'buffer' || event.case === 'output' ? [event.value] : [],
  );
  return Buffer.concat(chunks).toString();
}

describe('CreateTerminal', () => {
  test('creates a stopped terminal named after the project and the workspace', async () => {
    const terminal = await create();
    expect(terminal).toMatchObject({ workspaceId, name: 'demo-demo-1', state: { case: 'stopped' } });
    expect(await create()).toMatchObject({ name: 'demo-demo-2' });
    expect(await create('Build')).toMatchObject({ name: 'Build' });
  });

  test('fails with NOT_FOUND for a workspace that does not exist', async () => {
    await expect(harness.client.createTerminal({ workspaceId: 'missing' })).rejects.toMatchObject({
      code: Code.NOT_FOUND,
    });
  });
});

describe('GetTerminals', () => {
  test('returns the terminals of the workspace sorted by oldest first', async () => {
    const a = await create('a');
    const b = await create('b');
    const other = await harness.workspace('Other');
    await harness.client.createTerminal({ workspaceId: other.id, name: 'c' });
    expect((await getTerminals()).map((terminal) => terminal.id)).toEqual([a.id, b.id]);
    expect((await getTerminals('')).map((terminal) => terminal.name)).toEqual(['a', 'b', 'c']);
  });

  test('fails with NOT_FOUND for a workspace that does not exist', async () => {
    await expect(getTerminals('missing')).rejects.toMatchObject({ code: Code.NOT_FOUND });
  });
});

describe('UpdateTerminal', () => {
  test('renames the terminal', async () => {
    const terminal = await create('a');
    const { terminal: updated } = await harness.client.updateTerminal({ terminalId: terminal.id, name: 'b' });
    expect(updated).toMatchObject({ id: terminal.id, name: 'b' });
    expect(await getTerminals()).toMatchObject([{ name: 'b' }]);
  });

  test('fails with INVALID_ARGUMENT for an empty name', async () => {
    const terminal = await create('a');
    await expect(harness.client.updateTerminal({ terminalId: terminal.id, name: '' })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
  });

  test('fails with NOT_FOUND for a terminal that does not exist', async () => {
    await expect(harness.client.updateTerminal({ terminalId: 'missing', name: 'b' })).rejects.toMatchObject({
      code: Code.NOT_FOUND,
    });
  });
});

describe('DeleteTerminal', () => {
  test('deletes the terminal', async () => {
    const terminal = await create();
    await harness.client.deleteTerminal({ terminalId: terminal.id });
    expect(await getTerminals()).toEqual([]);
    await expect(harness.client.deleteTerminal({ terminalId: terminal.id })).rejects.toMatchObject({
      code: Code.NOT_FOUND,
    });
  });

  test('kills the shell and ends the streams attached to it', async () => {
    const terminal = await create();
    const attached = attach(terminal.id);
    await expect.poll(() => getTerminals()).toMatchObject([{ state: { case: 'running' } }]);
    await harness.client.deleteTerminal({ terminalId: terminal.id });
    await attached.ended;
    expect(attached.exit()).toBeDefined();
  });
});

describe('AttachTerminal', () => {
  test('starts the shell, streams its output and ends with its exit', async () => {
    const terminal = await create();
    const attached = attach(terminal.id);
    await expect.poll(() => attached.events()).toContain('buffer');
    expect(attached.events().slice(0, 3)).toEqual(['size', 'clients', 'buffer']);
    expect(attached.sizes()).toMatchObject([SIZE]);
    expect(attached.clients()).toEqual([1]);
    expect(await getTerminals()).toMatchObject([{ state: { case: 'running' }, clients: 1 }]);
    attached.type('echo hel""lo\r');
    await expect.poll(() => attached.text()).toContain('hello');
    attached.type('exit 3\r');
    await attached.ended;
    expect(attached.exit()).toMatchObject({ cause: { case: 'code', value: 3 } });
    expect(await getTerminals()).toMatchObject([
      { state: { case: 'exited', value: { exit: { cause: { value: 3 } } } }, clients: 0 },
    ]);
  });

  test('restores the buffer of the last shell before starting the next one at the saved size', async () => {
    const terminal = await create();
    const first = attach(terminal.id, { columns: 100, rows: 30 });
    first.type('echo hel""lo\r');
    await expect.poll(() => first.text()).toContain('hello');
    first.type('exit 3\r');
    await first.ended;

    const second = attach(terminal.id, null);
    await expect.poll(() => second.events()).toContain('buffer');
    expect(second.sizes()).toMatchObject([{ columns: 100, rows: 30 }]);
    const buffer = second.buffer();
    expect(buffer.indexOf('hello')).toBeGreaterThanOrEqual(0);
    expect(buffer.indexOf('shell exited with code 3')).toBeGreaterThan(buffer.indexOf('hello'));
    second.type('echo aga""in\r');
    await expect.poll(() => second.text()).toContain('again');
    expect(await getTerminals()).toMatchObject([{ state: { case: 'running' } }]);
    second.cancel();
  });

  test('streams to every attached client and takes the latest size while informing every client', async () => {
    const terminal = await create();
    const a = attach(terminal.id);
    await expect.poll(() => a.events()).toContain('buffer');
    const b = attach(terminal.id, { columns: 100, rows: 30 });
    await expect.poll(() => b.events()).toContain('buffer');
    expect(b.sizes()).toMatchObject([{ columns: 100, rows: 30 }]);
    expect(b.clients()).toEqual([2]);
    await expect.poll(() => a.sizes()).toMatchObject([SIZE, { columns: 100, rows: 30 }]);
    expect(a.clients()).toEqual([1, 2]);
    expect(await getTerminals()).toMatchObject([{ clients: 2 }]);
    a.type('echo bo""th\r');
    await expect.poll(() => a.text()).toContain('both');
    await expect.poll(() => b.text()).toContain('both');
    b.cancel();
    await expect.poll(() => a.clients()).toEqual([1, 2, 1]);
    a.resize(120, 40);
    a.type('node -e "console.log(\'cols=\' + process.stdout.columns)"\r');
    await expect.poll(() => a.text()).toContain('cols=120');
    expect(a.sizes()).toMatchObject([SIZE, { columns: 100, rows: 30 }, { columns: 120, rows: 40 }]);
    a.cancel();
  });

  test('leaves the existing size for an open that does not specify one', async () => {
    const terminal = await create();
    const a = attach(terminal.id, null);
    await expect.poll(() => a.events()).toContain('buffer');
    expect(a.sizes()).toMatchObject([SIZE]);
    a.resize(100, 30);
    const b = attach(terminal.id, null);
    await expect.poll(() => b.events()).toContain('buffer');
    expect(b.sizes()).toMatchObject([{ columns: 100, rows: 30 }]);
    expect(a.sizes()).toMatchObject([SIZE, { columns: 100, rows: 30 }]);
    a.cancel();
    b.cancel();
  });

  test('shares one shell between concurrent attaches', async () => {
    const terminal = await create();
    const a = attach(terminal.id);
    const b = attach(terminal.id, { columns: 100, rows: 30 });
    await expect.poll(() => a.clients()).toContain(2);
    await expect.poll(() => b.clients()).toContain(2);
    expect(a.sizes()[0]).toEqual(b.sizes()[0]);
    expect([SIZE.columns, 100]).toContain(a.sizes()[0]?.columns);
    expect(await getTerminals()).toMatchObject([{ state: { case: 'running' }, clients: 2 }]);
    a.cancel();
    b.cancel();
  });

  test('keeps the buffer of a shell the daemon stops', async () => {
    const terminal = await create();
    const attached = attach(terminal.id);
    attached.type('echo kee""p\r');
    await expect.poll(() => attached.text()).toContain('keep');
    await harness.restart();
    expect(await getTerminals()).toMatchObject([{ state: { case: 'stopped' } }]);
    const again = attach(terminal.id);
    await expect.poll(() => again.events()).toContain('buffer');
    const buffer = again.buffer();
    expect(buffer.indexOf('daemon restarted')).toBeGreaterThan(buffer.indexOf('keep'));
    again.cancel();
  });

  test('replaces the output a client that exceeds the max queued bytes', async () => {
    await harness.close();
    harness = await TerminalHarness.start({ saveDelayMs: 50, maxQueuedBytes: 0 });
    workspaceId = (await harness.workspace()).id;
    const terminal = await create();
    const attached = attach(terminal.id);
    attached.type('echo hel""lo\r');
    await expect.poll(() => attached.buffer()).toContain('hello');
    expect(attached.events()).not.toContain('output');
    attached.cancel();
  });

  test('fails with INVALID_ARGUMENT for an empty size', async () => {
    const terminal = await create();
    const { ended } = attach(terminal.id, { columns: 0, rows: 24 });
    await expect(ended).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
  });

  test('fails with INVALID_ARGUMENT unless the first request opens the stream', async () => {
    const call = harness.client.attachTerminal();
    const { ended } = collect(call.responses);
    void call.send({ event: { case: 'input', value: Buffer.from('x') } });
    await expect(ended).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
  });

  test('fails with NOT_FOUND for a terminal that does not exist', async () => {
    const { ended } = attach('missing');
    await expect(ended).rejects.toMatchObject({ code: Code.NOT_FOUND });
  });
});

describe('Exec', () => {
  async function run(program: string, args: string[], stdin = ''): Promise<ExecResponse[]> {
    const responses = harness.client.exec({
      program,
      args,
      absolutePath: harness.protocolRoot,
      env: { GREETING: 'hello' },
      stdin: Buffer.from(stdin),
    });
    const { seen, ended } = collect(responses);
    await ended;
    return seen;
  }

  test('streams the outputs then the exit code', async () => {
    const responses = await run(
      process.execPath,
      [
        '-e',
        "process.stdin.pipe(process.stdout); process.stderr.write(process.env.GREETING); process.stdin.on('end', () => process.exit(3))",
      ],
      'world',
    );
    const outputs = responses.map(({ event }) => [
      event.case,
      event.case === 'exit' ? event.value : Buffer.from(event.value as Uint8Array).toString(),
    ]);
    expect(outputs).toContainEqual(['stdout', 'world']);
    expect(outputs).toContainEqual(['stderr', 'hello']);
    expect(responses.at(-1)?.event).toMatchObject({ case: 'exit', value: { cause: { case: 'code', value: 3 } } });
  });

  test('fails with NOT_FOUND for a program that does not exist', async () => {
    await expect(run('elsewise-no-such-program', [])).rejects.toMatchObject({ code: Code.NOT_FOUND });
  });

  test('kills the program when the stream is cancelled', async () => {
    const controller = new AbortController();
    const responses = harness.client.exec(
      {
        program: process.execPath,
        args: ['-e', "process.stdout.write('on'); setInterval(() => {}, 1000)"],
        absolutePath: harness.protocolRoot,
      },
      { signal: controller.signal },
    );
    const { seen, ended } = collect(responses);
    await expect.poll(() => seen.length).toBe(1);
    controller.abort();
    await expect(ended).rejects.toMatchObject({ code: Code.CANCELLED });
  });
});
