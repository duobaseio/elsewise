import { Code, TransportError } from '@elsewise/transport';
import { execa } from 'execa';
import { whichCommand } from 'which-command';
import { fsToTransportError } from '../fs/error';
import type { Exit } from './shell';

export interface ExecOptions {
  /** The program to run. */
  program: string;

  /** The arguments. */
  args: string[];

  /** The native path the program starts in. */
  cwd: string;

  /** The environment variables. */
  env: Record<string, string>;

  /** What the program reads from stdin. */
  stdin: Uint8Array;

  /** The most bytes of output held for a consumer that is not reading before the program's output is paused. */
  maxQueuedBytes: number;
}

/** What a program emits. */
export type ExecEvent =
  | { case: 'stdout'; value: Uint8Array }
  | { case: 'stderr'; value: Uint8Array }
  | { case: 'exit'; value: Exit };

/**
 * Runs a program to completion and yields its events.
 *
 * Aborting the signal kills the program and fails the run with CANCELLED. A program that cannot be found fails with
 * NOT_FOUND.
 */
export async function* exec(options: ExecOptions, signal: AbortSignal): AsyncGenerator<ExecEvent> {
  const queue: ExecEvent[] = [];
  let queued = 0; // The bytes of output in the queue.
  let paused = false;
  let wake: (() => void) | undefined;
  let done = false;

  const subprocess = execa(options.program, options.args, {
    cwd: options.cwd,
    env: options.env,
    ...(options.stdin.byteLength > 0 ? { input: Buffer.from(options.stdin) } : { stdin: 'ignore' }),
    cancelSignal: signal,
    buffer: false,
    encoding: 'buffer',
    stripFinalNewline: false,
    windowsHide: true,
    reject: false,
  });

  const pause = () => {
    paused = true;
    subprocess.stdout?.pause();
    subprocess.stderr?.pause();
  };
  const resume = () => {
    paused = false;
    subprocess.stdout?.resume();
    subprocess.stderr?.resume();
  };

  const push = (stream: 'stdout' | 'stderr', chunk: Uint8Array) => {
    queue.push({ case: stream, value: chunk });
    queued += chunk.byteLength;
    if (queued > options.maxQueuedBytes && !paused) {
      pause();
    }
    wake?.();
  };
  subprocess.stdout?.on('data', (chunk: Uint8Array) => push('stdout', chunk));
  subprocess.stderr?.on('data', (chunk: Uint8Array) => push('stderr', chunk));
  const settled = () => {
    done = true;
    wake?.();
  };
  const running = subprocess.then(
    (result) => result,
    (error) => error,
  );
  void running.then(settled);

  try {
    while (true) {
      const next = queue.shift();
      if (next) {
        if (next.case !== 'exit') {
          queued -= next.value.byteLength;
          if (paused && queued < options.maxQueuedBytes / 4) {
            resume();
          }
        }
        yield next;
        continue;
      }
      if (done) {
        break;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
  } finally {
    // A consumer that stops reading early has to resume.
    resume();
  }

  const result = await running;
  if (!('exitCode' in result) && !('signal' in result)) {
    throw fsToTransportError(result); // Failed before a process ran.
  }
  if (result.isCanceled) {
    throw new TransportError(Code.CANCELLED, 'the call was cancelled');
  }
  if (result.code === 'ENOENT' || (result.failed && (await missingOnWindows(options)))) {
    throw new TransportError(Code.NOT_FOUND, `${options.program} cannot be found on the daemon's machine`);
  }
  if (result.signal !== undefined) {
    yield { case: 'exit', value: { case: 'signal', value: result.signal } };
  } else if (result.exitCode !== undefined) {
    yield { case: 'exit', value: { case: 'code', value: result.exitCode } };
  } else {
    throw fsToTransportError(result);
  }
}

/**
 * Returns whether the program is missing on Windows.
 *
 * Execa on Windows returns exit code 1 instead of ENOENT.
 */
async function missingOnWindows(options: ExecOptions): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }
  const path = options.env.PATH ?? process.env.PATH;
  return (await whichCommand(options.program, { cwd: options.cwd, path })) === undefined;
}
