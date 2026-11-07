import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Code, TransportError } from '@elsewise/transport';
import { expect, test } from 'vitest';
import { type ExecEvent, type ExecOptions, exec } from './exec';

function node(script: string, options: Partial<ExecOptions> = {}): ExecOptions {
  return {
    program: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    env: {},
    stdin: new Uint8Array(),
    maxQueuedBytes: 1024 * 1024,
    ...options,
  };
}

async function run(options: ExecOptions, signal = new AbortController().signal): Promise<ExecEvent[]> {
  const events: ExecEvent[] = [];
  for await (const event of exec(options, signal)) {
    events.push(event);
  }
  return events;
}

function text(events: ExecEvent[], stream: 'stdout' | 'stderr'): string {
  return Buffer.concat(events.flatMap((event) => (event.case === stream ? [event.value] : []))).toString();
}

test('streams stdout, stderr and the exit code', async () => {
  const events = await run(node("process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"));
  expect(text(events, 'stdout')).toBe('out');
  expect(text(events, 'stderr')).toBe('err');
  expect(events.at(-1)).toEqual({ case: 'exit', value: { case: 'code', value: 3 } });
});

test('passes stdin and the environment', async () => {
  const events = await run(
    node("process.stdin.pipe(process.stdout); process.stdout.write(process.env.GREETING + ' ')", {
      env: { GREETING: 'hello' },
      stdin: Buffer.from('world'),
    }),
  );
  expect(text(events, 'stdout')).toBe('hello world');
  expect(events.at(-1)).toEqual({ case: 'exit', value: { case: 'code', value: 0 } });
});

test('ends stdin when nothing is passed', async () => {
  const events = await run(
    node("process.stdin.on('end', () => process.stdout.write('ended')); process.stdin.resume()"),
  );
  expect(text(events, 'stdout')).toBe('ended');
});

test('pauses the program when its output is not read', async () => {
  const size = 1024 * 1024;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-exec-'));
  const marker = path.join(directory, 'written');
  const script = `process.stdout.write(Buffer.alloc(${size}, 97), () => require('fs').writeFileSync(${JSON.stringify(marker)}, ''))`;
  try {
    const events = exec(node(script, { maxQueuedBytes: 64 * 1024 }), new AbortController().signal);
    const first = await events.next();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(existsSync(marker)).toBe(false);
    let bytes = first.value?.case === 'stdout' ? first.value.value.byteLength : 0;
    for await (const event of events) {
      bytes += event.case === 'stdout' ? event.value.byteLength : 0;
    }
    expect(bytes).toBe(size);
    expect(existsSync(marker)).toBe(true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === 'win32')('reports the signal that killed the program', async () => {
  const events = await run(node("process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1000)"));
  expect(events.at(-1)).toEqual({ case: 'exit', value: { case: 'signal', value: 'SIGTERM' } });
});

test('fails with NOT_FOUND for a program that does not exist', async () => {
  await expect(run(node('', { program: 'elsewise-no-such-program' }))).rejects.toMatchObject({
    code: Code.NOT_FOUND,
  });
});

test('kills the program and fails with CANCELLED when aborted', async () => {
  const controller = new AbortController();
  const events = exec(node("process.stdout.write('started'); setInterval(() => {}, 1000)"), controller.signal);
  const first = await events.next();
  expect(first.value).toEqual({ case: 'stdout', value: Buffer.from('started') });
  controller.abort();
  await expect(events.next()).rejects.toSatisfy(
    (error) => error instanceof TransportError && error.code === Code.CANCELLED,
  );
});
