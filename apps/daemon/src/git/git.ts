import path from 'node:path';
import { Code, TransportError } from '@elsewise/transport';
import { execa } from 'execa';
import { GitError } from './error';

/** Overrides the daemon's own environment on git. */
const OVERRIDES: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0', // Fails instead of asking for credentials.
  GIT_EDITOR: 'true', // Keeps the message git would otherwise open an editor for.
  GIT_SEQUENCE_EDITOR: 'true',
  LC_ALL: 'C', // English messages, so what the client shows does not depend on the daemon's locale.
};

export interface RunOptions {
  /** Aborting it kills the process and fails the run with CANCELLED. */
  signal?: AbortSignal;

  /** Environment variables. */
  env?: Record<string, string>;

  /** Receives what the process writes to stderr as it arrives. */
  onStderr?: (chunk: Buffer) => void;

  /** What the process reads. */
  stdin?: string | Buffer;

  /**
   * The exit codes that count as success
   *
   * `0` by default.
   */
  exitCodes?: number[];
}

/** Runs git in a directory. */
export class Git {
  /** The native absolute path of the worktree root. */
  readonly root: string;

  /** The size in bytes past which the output fails a run with RESOURCE_EXHAUSTED. */
  readonly limitBytes: number;

  constructor(root: string, limitBytes: number) {
    this.root = root;
    this.limitBytes = limitBytes;
  }

  /** Runs git with the arguments and returns stdout. */
  async run(args: string[], options: RunOptions = {}): Promise<Buffer> {
    const subprocess = execa('git', args, {
      cwd: this.root,
      env: { ...OVERRIDES, GIT_CEILING_DIRECTORIES: path.dirname(this.root), ...options.env },
      input: options.stdin,
      cancelSignal: options.signal,
      maxBuffer: { stdout: this.limitBytes },
      encoding: 'buffer',
      stripFinalNewline: false,
      reject: false,
    });
    if (options.onStderr) {
      subprocess.stderr.on('data', options.onStderr);
    }

    const result = await subprocess;
    if (result.isCanceled) {
      throw new TransportError(Code.CANCELLED, 'the call was cancelled');
    }
    if (result.isMaxBuffer) {
      throw new TransportError(Code.RESOURCE_EXHAUSTED, 'the output is over the read limit');
    }
    if (result.code === 'ENOENT') {
      throw new TransportError(Code.FAILED_PRECONDITION, 'git is not installed on the daemon machine');
    }
    const stdout = view(result.stdout);
    if (result.exitCode === undefined || !(options.exitCodes ?? [0]).includes(result.exitCode)) {
      throw new GitError(result.exitCode ?? null, view(result.stderr).toString(), stdout.toString());
    }
    return stdout;
  }

  /** Runs git in a directory and returns a text. */
  async text(args: string[], options?: RunOptions): Promise<string> {
    return (await this.run(args, options)).toString();
  }
}

function view(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
