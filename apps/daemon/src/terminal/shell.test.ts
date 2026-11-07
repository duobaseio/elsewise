import { afterEach, describe, expect, test } from 'vitest';
import { type Exit, type Restore, Shell, type ShellEvent } from './shell';

const shells: Shell[] = [];

afterEach(async () => {
  for (const shell of shells.splice(0)) {
    await shell.kill();
    shell.dispose();
  }
});

/** Starts node running the script. */
async function start(script: string, restore?: Restore): Promise<{ shell: Shell; events: ShellEvent[] }> {
  const shell = await Shell.start({
    program: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    env: process.env,
    size: { columns: 80, rows: 24 },
    scrollback: 100,
    restore,
  });
  shells.push(shell);
  const events: ShellEvent[] = [];
  shell.subscribe((event) => events.push(event));
  return { shell, events };
}

function text(events: ShellEvent[]): string {
  return Buffer.concat(events.flatMap((event) => (event.case === 'output' ? [event.value] : []))).toString();
}

function exitOf(events: ShellEvent[]): Exit | undefined {
  return events.find((event) => event.case === 'exit')?.value;
}

describe('start', () => {
  test('emits the output and exit', async () => {
    const { shell, events } = await start("console.log('hi'); process.exit(4)");
    expect(await shell.exited).toEqual({ case: 'code', value: 4 });
    expect(text(events)).toContain('hi');
    expect(events.at(-1)).toEqual({ case: 'exit', value: { case: 'code', value: 4 } });
    expect(shell.exit).toEqual({ case: 'code', value: 4 });
  });

  test('restores the buffer of the last shell', async () => {
    const first = await start("console.log('old'); process.exit(1)");
    await first.shell.exited;
    const restore = { buffer: await first.shell.snapshot(), size: { columns: 80, rows: 24 }, marker: 'shell exited' };
    const { shell } = await start("console.log('new'); process.exit(0)", restore);
    await shell.exited;
    const buffer = Buffer.from(await shell.snapshot()).toString();
    expect(buffer.indexOf('old')).toBeLessThan(buffer.indexOf('shell exited'));
    expect(buffer.indexOf('shell exited')).toBeLessThan(buffer.indexOf('new'));
  });
});

describe('attach', () => {
  test('returns the buffer and events', async () => {
    const { shell } = await start(
      "console.log('first'); process.stdin.once('data', () => { console.log('second'); process.exit(0) })",
    );
    await expect.poll(() => shell.snapshot().then((buffer) => buffer.toString())).toContain('first');
    const events: ShellEvent[] = [];
    await shell.attach((event) => events.push(event));
    expect(events.map((event) => event.case)).toEqual(['size', 'clients', 'buffer']);
    expect(Buffer.from(events[2]?.value as Uint8Array).toString()).toContain('first');
    shell.write(Buffer.from('\r'));
    await shell.exited;
    expect(text(events)).toContain('second');
    expect(text(events)).not.toContain('first');
    expect(exitOf(events)).toEqual({ case: 'code', value: 0 });
  });

  test('counts the clients and emits to every listener', async () => {
    const { shell, events } = await start('setInterval(() => {}, 1000)');
    const first: ShellEvent[] = [];
    await shell.attach((event) => first.push(event));
    expect(first[0]).toEqual({ case: 'size', value: { columns: 80, rows: 24 } });
    const detach = await shell.attach(() => {});
    expect(shell.clients).toBe(2);
    detach();
    detach();
    expect(shell.clients).toBe(1);
    const clientsOf = (seen: ShellEvent[]) => seen.flatMap((event) => (event.case === 'clients' ? [event.value] : []));
    expect(clientsOf(first)).toEqual([1, 2, 1]);
    expect(clientsOf(events)).toEqual([1, 2, 1]);
  });

  test('emits the exit when the shell exited', async () => {
    const { shell } = await start('process.exit(2)');
    await shell.exited;
    const events: ShellEvent[] = [];
    await shell.attach((event) => events.push(event));
    expect(events.map((event) => event.case)).toEqual(['size', 'clients', 'buffer', 'exit']);
    expect(events[3]).toEqual({ case: 'exit', value: { case: 'code', value: 2 } });
  });
});

describe('resync', () => {
  test('sends a snapshot ordered after the output applied before the call', async () => {
    const { shell } = await start(
      "console.log('first'); process.stdin.once('data', () => { console.log('second'); process.exit(0) })",
    );
    const events: ShellEvent[] = [];
    const listener = (event: ShellEvent) => events.push(event);
    await shell.attach(listener);
    await expect.poll(() => text(events) + Buffer.from(events[2]?.value as Uint8Array).toString()).toContain('first');
    shell.resync(listener);
    shell.write(Buffer.from('\r'));
    await shell.exited;
    const buffers = events.flatMap((event, index) => (event.case === 'buffer' ? [index] : []));
    expect(buffers).toHaveLength(2);
    const snapshot = Buffer.from(events[buffers[1] ?? -1]?.value as Uint8Array).toString();
    expect(snapshot).toContain('first');
    expect(snapshot).not.toContain('second');
    expect(text(events.slice(buffers[1]))).toContain('second');
  });
});

describe('write', () => {
  test('writes to the shell', async () => {
    const { shell, events } = await start(
      "process.stdin.on('data', (d) => { process.stdout.write('got ' + d); process.exit(0) })",
    );
    shell.write(Buffer.from('abc\r'));
    await shell.exited;
    expect(text(events)).toContain('got abc');
  });
});

describe('resize', () => {
  test('resizes the shell', async () => {
    const { shell, events } = await start(
      [
        // Windows reports a resize only to a process reading its input in raw mode.
        'process.stdin.setRawMode(true); process.stdin.resume();',
        "process.stdout.on('resize', () => console.log('cols=' + process.stdout.columns)); console.log('ready')",
      ].join(' '),
    );
    await expect.poll(() => text(events)).toContain('ready');
    shell.resize({ columns: 100, rows: 30 });
    expect(shell.size).toEqual({ columns: 100, rows: 30 });
    await expect.poll(() => text(events)).toContain('cols=100');
  });
});

describe('kill', () => {
  test('kills the shell', async () => {
    const { shell, events } = await start('setInterval(() => {}, 1000)');
    const exit = await shell.kill();
    expect(exitOf(events)).toEqual(exit);
    if (process.platform !== 'win32') {
      expect(exit).toEqual({ case: 'signal', value: 'SIGHUP' });
    }
  });
});
