import os from 'node:os';
import { type IPty, spawn } from '@lydell/node-pty';
import type { SerializeAddon } from '@xterm/addon-serialize';
import serialize from '@xterm/addon-serialize';
import type { Terminal } from '@xterm/headless';
import xterm from '@xterm/headless';

/** The size of a terminal in cells. */
export interface Size {
  columns: number;
  rows: number;
}

/** Represents a process ended. */
export type Exit = { case: 'code'; value: number } | { case: 'signal'; value: string };

/** Represents what a shell emits. */
export type ShellEvent =
  | { case: 'output'; value: Uint8Array }
  | { case: 'size'; value: Size }
  | { case: 'clients'; value: number }
  | { case: 'buffer'; value: Uint8Array }
  | { case: 'exit'; value: Exit };

export interface ShellOptions {
  /** The program to run. */
  program: string;

  /** The arguments. */
  args: string[];

  /** The native path the shell starts in. */
  cwd: string;

  /** The environment. */
  env: Record<string, string | undefined>;

  /** The size the shell starts at. */
  size: Size;

  /** The number of rows the buffer keeps above the viewport. */
  scrollback: number;

  /** The buffer of the last shell, restored before the new shell's output. */
  restore?: Restore;
}

export interface Restore {
  /** The escape sequences that reproduce the last shell's buffer. */
  buffer: Uint8Array;

  /** The size the buffer was serialized at. */
  size: Size;

  /** The line written between the restored buffer and the new shell's output. */
  marker: string;
}

/**
 * Leaves the alternate screen and restores the cursor saved prior to entering (e.g. for full screen programs like vim
 * should display the commands ran before vim appeared rather than showing a broken state of vim).
 */
const LEAVE_ALTERNATE_SCREEN = '\x1b[?1049l';

// Turns off the modes the last shell may have left on and soft resets.
const RESET = '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1004l\x1b[?1006l\x1b[?2004l\x1b[?2026l\x1b[?25h\x1b[0m\x1b[!p';

/**
 * Applies back pressure to the pty.
 *
 * When pause bytes is reached, bytes will stop being queued from the pty. Resume represents when reading from the pty
 * may continue.
 */
const PAUSE_BYTES = 1024 * 1024;
const RESUME_BYTES = PAUSE_BYTES / 4;

// Represents how long a killed shell has to exit before it is killed with SIGKILL.
const KILL_TIMEOUT_MS = 1_000;

/**
 * A shell running in a pseudoterminal with the headless terminal.
 *
 * Every write to the pseudoterminal's output goes through the buffer first, so a listener receives output only once
 * the buffer has applied it and a snapshot of the buffer is consistent with the output around it.
 */
export class Shell {
  /** Represents how the shell exited. */
  readonly exited: Promise<Exit>;

  readonly #terminal: Terminal;
  readonly #serializer: SerializeAddon;
  readonly #process: IPty;
  readonly #listeners = new Set<(event: ShellEvent) => void>();
  #clients = 0;
  #exit: Exit | undefined;
  #pending = 0;
  #paused = false;
  #disposed = false;

  private constructor(terminal: Terminal, serializer: SerializeAddon, process: IPty) {
    this.#terminal = terminal;
    this.#serializer = serializer;
    this.#process = process;
    this.exited = new Promise((resolve) => {
      process.onData((chunk) => this.#write(chunk));
      process.onExit((event) => {
        const exit = toExit(event);
        // Queued behind the output that arrived before the exit.
        this.#terminal.write('', () => {
          this.#exit = exit;
          this.#emit({ case: 'exit', value: exit });
          resolve(exit);
        });
      });
    });
  }

  /** Starts a shell and restores the last shell's buffer if it exists. */
  static async start(options: ShellOptions): Promise<Shell> {
    const { restore, size } = options;
    const terminal = new xterm.Terminal({
      allowProposedApi: true,
      cols: restore?.size.columns ?? size.columns,
      rows: restore?.size.rows ?? size.rows,
      scrollback: options.scrollback,
    });
    const serializer = new serialize.SerializeAddon();
    terminal.loadAddon(serializer);
    try {
      if (restore) {
        await apply(terminal, restore.buffer);
        if (terminal.buffer.active.type === 'alternate') {
          await apply(terminal, LEAVE_ALTERNATE_SCREEN);
        }
        await apply(terminal, `${RESET}\r\n\x1b[2m${restore.marker}\x1b[0m\r\n`);
        terminal.resize(size.columns, size.rows);
      }
      const process = spawn(options.program, options.args, {
        name: 'xterm-256color',
        cols: size.columns,
        rows: size.rows,
        cwd: options.cwd,
        env: options.env,
        encoding: null,
      });
      return new Shell(terminal, serializer, process);
    } catch (error) {
      terminal.dispose();
      throw error;
    }
  }

  /** The size of the terminal. */
  get size(): Size {
    return { columns: this.#terminal.cols, rows: this.#terminal.rows };
  }

  /** The number of clients attached. */
  get clients(): number {
    return this.#clients;
  }

  /** How the shell exited. Returns undefined if the shell has not exited. */
  get exit(): Exit | undefined {
    return this.#exit;
  }

  /** Adds a listener. Returns a function that clears the listener. */
  subscribe(listener: (event: ShellEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Adds a client's listener. Returns a function that detaches the client. */
  attach(listener: (event: ShellEvent) => void): Promise<() => void> {
    return new Promise((resolve) => {
      this.#terminal.write('', () => {
        this.#listeners.add(listener);
        listener({ case: 'size', value: this.size });
        this.#clients++;
        this.#emit({ case: 'clients', value: this.#clients });
        listener({ case: 'buffer', value: this.#serialize() });
        if (this.#exit) {
          listener({ case: 'exit', value: this.#exit });
        }
        resolve(() => {
          if (this.#listeners.delete(listener)) {
            this.#clients--;
            this.#emit({ case: 'clients', value: this.#clients });
          }
        });
      });
    });
  }

  /** Returns the escape sequences that reproduce the buffer. */
  snapshot(): Promise<Buffer> {
    return new Promise((resolve) => {
      this.#terminal.write('', () => resolve(this.#serialize()));
    });
  }

  /** Writes to the shell's input. */
  write(input: Uint8Array): void {
    if (this.#exit) {
      return;
    }
    this.#process.write(Buffer.from(input.buffer, input.byteOffset, input.byteLength) as unknown as string);
  }

  /** Resizes the terminal and pseudoterminal. */
  resize(size: Size): void {
    if (size.columns === this.#terminal.cols && size.rows === this.#terminal.rows) {
      return;
    }
    this.#terminal.resize(size.columns, size.rows);
    if (!this.#exit) {
      this.#process.resize(size.columns, size.rows);
    }
    this.#emit({ case: 'size', value: this.size });
  }

  /** Kills the shell. */
  kill(): Promise<Exit> {
    if (!this.#exit) {
      this.#process.kill();
      if (process.platform !== 'win32') {
        const timer = setTimeout(() => this.#process.kill('SIGKILL'), KILL_TIMEOUT_MS);
        void this.exited.then(() => clearTimeout(timer));
      }
    }
    return this.exited;
  }

  /** Releases the buffer. Throws if the shell has not exited. */
  dispose(): void {
    if (!this.#exit) {
      throw new Error('the shell has not exited');
    }
    if (!this.#disposed) {
      this.#disposed = true;
      this.#listeners.clear();
      this.#terminal.dispose();
    }
  }

  #write(chunk: string | Uint8Array): void {
    if (this.#disposed) {
      return;
    }
    const output = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this.#pending += output.byteLength;
    if (this.#pending > PAUSE_BYTES && !this.#paused) {
      this.#paused = true;
      this.#process.pause();
    }
    this.#terminal.write(output, () => {
      this.#pending -= output.byteLength;
      if (this.#paused && this.#pending < RESUME_BYTES) {
        this.#paused = false;
        this.#process.resume();
      }
      this.#emit({ case: 'output', value: output });
    });
  }

  #emit(event: ShellEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #serialize(): Buffer {
    return Buffer.from(this.#serializer.serialize());
  }
}

/** Writes to the terminal and settles once the buffer has applied it. */
function apply(terminal: Terminal, data: string | Uint8Array): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

function toExit(event: { exitCode: number; signal?: number }): Exit {
  return event.signal ? { case: 'signal', value: signalName(event.signal) } : { case: 'code', value: event.exitCode };
}

function signalName(signal: number): string {
  for (const [name, number] of Object.entries(os.constants.signals)) {
    if (number === signal) {
      return name;
    }
  }
  return `SIG${signal}`;
}
