import { Code, TransportError } from '@elsewise/transport';
import { whichCommand } from 'which-command';
import type { TerminalOptions } from './service';
import { type Exit, Shell, type Size } from './shell';
import type { TerminalRow, TerminalStore } from './store';

/** The state of a terminal's shell. */
export type ShellState = { case: 'running' } | { case: 'exited'; value: Exit } | { case: 'stopped' };

/** Represents what the terminal is once its shell is gone. */
export type Outcome =
  | 'exited' // The shell ended with an exit code.
  | 'stopped' // The terminal is closed gracefully.
  | 'deleted'; // Terminal is deleted and nothing needs to be saved.

/** A running shell. */
interface Entry {
  terminal: Pick<TerminalRow, 'id' | 'workspace_id'>;
  shell: Shell;

  /** Settles once the shell has exited and its last state is saved. */
  finished: Promise<void>;

  /** The save in flight. */
  saving: Promise<void>;

  /** The pending save after an output. */
  timer: NodeJS.Timeout | undefined;

  outcome: Outcome;
}

/** The shells the daemon runs, one per terminal at most, saving their state to the store. */
export class Shells {
  readonly #store: TerminalStore;
  readonly #options: TerminalOptions;
  readonly #entries = new Map<string, Entry>();
  readonly #starting = new Map<string, Promise<Shell>>();

  constructor(store: TerminalStore, options: TerminalOptions) {
    this.#store = store;
    this.#options = options;
  }

  /** Returns the terminal's shell. */
  get(terminalId: string): Shell | undefined {
    const entry = this.#entries.get(terminalId);
    return entry && !entry.shell.exit ? entry.shell : undefined;
  }

  /** Returns the state of the terminal's shell. */
  stateOf(terminal: Pick<TerminalRow, 'id' | 'exit_code' | 'exit_signal'>): ShellState {
    const entry = this.#entries.get(terminal.id);
    if (entry) {
      return entry.shell.exit ? { case: 'exited', value: entry.shell.exit } : { case: 'running' };
    }
    if (terminal.exit_code !== null) {
      return { case: 'exited', value: { case: 'code', value: terminal.exit_code } };
    }
    if (terminal.exit_signal !== null) {
      return { case: 'exited', value: { case: 'signal', value: terminal.exit_signal } };
    }
    return { case: 'stopped' };
  }

  /** Returns the number of clients attached to the terminal's shell. */
  clientsOf(terminalId: string): number {
    return this.#entries.get(terminalId)?.shell.clients ?? 0;
  }

  /** Starts the terminal's login shell in the given directory. */
  start(terminalId: string, cwd: string, size: Size | undefined): Promise<Shell> {
    // Ensures concurrent starts can't race each other.
    let starting = this.#starting.get(terminalId);
    if (!starting) {
      starting = this.#start(terminalId, cwd, size).finally(() => this.#starting.delete(terminalId));
      this.#starting.set(terminalId, starting);
    }
    return starting;
  }

  /** Kills the terminal's shell. */
  async kill(terminalId: string, outcome: Exclude<Outcome, 'exited'>): Promise<void> {
    await Promise.allSettled([this.#starting.get(terminalId)]);
    const entry = this.#entries.get(terminalId);
    if (entry) {
      await this.#close(entry, outcome);
    }
  }

  /** Kills the shells of the workspace's terminals. */
  async killWorkspace(workspaceId: string, outcome: Exclude<Outcome, 'exited'>): Promise<void> {
    await Promise.allSettled(this.#starting.values());
    const entries = [...this.#entries.values()].filter((entry) => entry.terminal.workspace_id === workspaceId);
    await Promise.all(entries.map((entry) => this.#close(entry, outcome)));
  }

  /** Kills every shell and saves it's buffer. Used to clean up this shells. */
  async close(): Promise<void> {
    await Promise.allSettled(this.#starting.values());
    await Promise.all([...this.#entries.values()].map((entry) => this.#close(entry, 'stopped')));
  }

  /** Starts the shell or returns a shell if it already exists. */
  async #start(terminalId: string, cwd: string, requestedSize: Size | undefined): Promise<Shell> {
    const running = this.get(terminalId);
    if (running) {
      return running;
    }
    // The last shell, if it has exited, saves its buffer and exit to the row before the row is read.
    await this.#entries.get(terminalId)?.finished;
    const terminal = await this.#store.getTerminal(terminalId);
    if (!terminal) {
      throw new TransportError(Code.NOT_FOUND, 'the terminal does not exist');
    }
    const size = requestedSize ?? { columns: terminal.columns, rows: terminal.rows };
    const shell = await Shell.start({
      ...(await loginShell()),
      cwd,
      env: { ...process.env, COLORTERM: 'truecolor' },
      size,
      scrollback: this.#options.scrollback,
      restore: terminal.buffer
        ? {
            buffer: terminal.buffer,
            size: { columns: terminal.columns, rows: terminal.rows },
            marker: markerOf(terminal),
          }
        : undefined,
    });
    const entry: Entry = {
      terminal: { id: terminal.id, workspace_id: terminal.workspace_id },
      shell,
      finished: Promise.resolve(),
      saving: Promise.resolve(),
      timer: undefined,
      outcome: 'exited',
    };
    entry.finished = shell.exited.then((exit) => this.#finish(entry, exit));
    this.#entries.set(terminal.id, entry);
    shell.subscribe((event) => {
      if (event.case === 'output') {
        entry.timer ??= setTimeout(() => {
          entry.timer = undefined;
          this.#save(entry, {});
        }, this.#options.saveDelayMs);
      }
    });
    await this.#store.updateTerminal(terminal.id, {
      columns: size.columns,
      rows: size.rows,
      exit_code: null,
      exit_signal: null,
    });
    return shell;
  }

  /** Ends the shell. */
  async #close(entry: Entry, outcome: Exclude<Outcome, 'exited'>): Promise<void> {
    entry.outcome = outcome;
    await entry.shell.kill();
    await entry.finished;
  }

  /** Runs once the shell ends and save the state. */
  async #finish(entry: Entry, exit: Exit): Promise<void> {
    clearTimeout(entry.timer);
    try {
      switch (entry.outcome) {
        case 'exited':
          await this.#save(entry, exitState(exit));
          break;
        case 'stopped':
          await this.#save(entry, {});
          break;
        case 'deleted':
          await entry.saving; // A save is still reading the shell, so wait before removing the entry.
          break;
      }
    } finally {
      this.#entries.delete(entry.terminal.id);
      entry.shell.dispose();
    }
  }

  /** Saves the shell's size and buffer. */
  #save(entry: Entry, state: { exit_code?: number | null; exit_signal?: string | null }): Promise<void> {
    entry.saving = entry.saving
      .then(async () => {
        const buffer = await entry.shell.snapshot();
        const { columns, rows } = entry.shell.size;
        await this.#store.updateTerminal(entry.terminal.id, { columns, rows, buffer, ...state });
      })
      .catch((error: unknown) => {
        console.error(`terminal ${entry.terminal.id}: the shell state could not be saved:`, error);
      });
    return entry.saving;
  }
}

/** Returns the machine's login shell. The user's on Unix and PowerShell on Windows. */
async function loginShell(): Promise<{ program: string; args: string[] }> {
  if (process.platform === 'win32') {
    const program = (await whichCommand('pwsh')) ?? (await whichCommand('powershell')) ?? 'powershell.exe';
    return { program, args: [] };
  }
  return { program: process.env.SHELL || '/bin/sh', args: ['-l'] };
}

/** Returns the line that separates the terminal's last buffer from the next shell. */
function markerOf(terminal: Pick<TerminalRow, 'exit_code' | 'exit_signal'>): string {
  if (terminal.exit_code !== null) {
    return `shell exited with code ${terminal.exit_code}`;
  }
  if (terminal.exit_signal !== null) {
    return `shell killed by ${terminal.exit_signal}`;
  }
  return 'daemon restarted';
}

function exitState(exit: Exit): { exit_code: number | null; exit_signal: string | null } {
  return exit.case === 'code'
    ? { exit_code: exit.value, exit_signal: null }
    : { exit_code: null, exit_signal: exit.value };
}
