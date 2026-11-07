import fs from 'node:fs/promises';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { Code, type HandlerContext, type ServiceImpl, TransportError } from '@elsewise/transport';
import { attempt, errnoOf } from '../fs/error';
import { toNativeRoot } from '../fs/path';
import type {
  AttachTerminalRequest,
  AttachTerminalResponseSchema,
  CreateTerminalRequest,
  DeleteTerminalRequest,
  ExecRequest,
  ExecResponseSchema,
  GetTerminalsRequest,
  Size as SizeMessage,
  TerminalSchema,
  TerminalService,
  UpdateTerminalRequest,
} from '../gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { kebabCase } from '../project/name';
import { exec } from './exec';
import type { Shell, ShellEvent, Size } from './shell';
import { type Outcome, Shells } from './shells';
import type { TerminalRow, TerminalStore } from './store';

export interface TerminalOptions {
  /** The most rows a terminal keeps above its viewport. */
  scrollback: number;

  /** How long after an output a running shell's buffer is saved in milliseconds. */
  saveDelayMs: number;

  /** The most bytes of output held for a client that is not reading before the entire buffer is sent instead. */
  maxQueuedBytes: number;
}

type TerminalInit = MessageInitShape<typeof TerminalSchema>;
type ExecEvent = MessageInitShape<typeof ExecResponseSchema>;
type AttachEvent = MessageInitShape<typeof AttachTerminalResponseSchema>;

const DEFAULT_SIZE: Size = { columns: 80, rows: 24 };
const MAX_CELLS = 65_535; // The most columns or rows a pseudoterminal's window size holds.

/** The `TerminalService`. */
export class TerminalServiceImpl implements ServiceImpl<typeof TerminalService> {
  readonly #store: TerminalStore;
  readonly #shells: Shells;
  readonly #options: TerminalOptions;

  constructor(store: TerminalStore, options: TerminalOptions) {
    this.#store = store;
    this.#shells = new Shells(store, options);
    this.#options = options;
  }

  /** Kills the shells of the workspace's terminals. */
  killWorkspace(workspaceId: string, outcome: Exclude<Outcome, 'exited'>): Promise<() => void> {
    return this.#shells.killWorkspace(workspaceId, outcome);
  }

  /** Gracefully closes every shell. */
  close(): Promise<void> {
    return this.#shells.close();
  }

  async *exec(request: ExecRequest, { signal }: HandlerContext): AsyncGenerator<ExecEvent> {
    if (request.program === '' || request.program.includes('\0')) {
      throw new TransportError(Code.INVALID_ARGUMENT, 'the program must not be empty');
    }
    const cwd = toNativeRoot(request.absolutePath);
    await attempt(() => refuseMissingDirectory(cwd));
    const events = exec(
      {
        program: request.program,
        args: request.args,
        cwd,
        env: request.env,
        stdin: request.stdin,
        maxQueuedBytes: this.#options.maxQueuedBytes,
      },
      signal,
    );
    for await (const event of events) {
      yield {
        event: event.case === 'exit' ? { case: 'exit', value: { cause: event.value } } : event,
      };
    }
  }

  createTerminal(request: CreateTerminalRequest) {
    return attempt(async () => {
      const workspace = await this.#store.getWorkspace(request.workspaceId);
      if (!workspace) {
        throw new TransportError(Code.NOT_FOUND, 'the workspace does not exist');
      }
      let name = request.name;
      if (name === '') {
        const taken = new Set((await this.#store.getTerminals(workspace.id)).map((terminal) => terminal.name));
        const base = [workspace.project_name, workspace.name].map(kebabCase).filter((part) => part !== '');
        for (let n = 1; ; n++) {
          name = [...base, n].join('-');
          if (!taken.has(name)) {
            break;
          }
        }
      }
      const terminal = await this.#store.createTerminal({
        workspace_id: workspace.id,
        name,
        columns: DEFAULT_SIZE.columns,
        rows: DEFAULT_SIZE.rows,
      });
      return { terminal: this.#terminalOf(terminal) };
    });
  }

  getTerminals(request: GetTerminalsRequest) {
    return attempt(async () => {
      if (request.workspaceId !== '' && !(await this.#store.getWorkspace(request.workspaceId))) {
        throw new TransportError(Code.NOT_FOUND, 'the workspace does not exist');
      }
      const rows = await this.#store.getTerminals(request.workspaceId === '' ? undefined : request.workspaceId);
      return { terminals: rows.map((row) => this.#terminalOf(row)) };
    });
  }

  updateTerminal(request: UpdateTerminalRequest) {
    return attempt(async () => {
      if (request.name === '') {
        throw new TransportError(Code.INVALID_ARGUMENT, 'the name must not be empty');
      }
      const terminal = await this.#store.updateTerminal(request.terminalId, { name: request.name });
      if (!terminal) {
        throw new TransportError(Code.NOT_FOUND, 'the terminal does not exist');
      }
      return { terminal: this.#terminalOf(terminal) };
    });
  }

  deleteTerminal(request: DeleteTerminalRequest) {
    return attempt(async () => {
      const terminal = await this.#refuseMissingTerminal(request.terminalId);
      const release = await this.#shells.kill(terminal.id, 'deleted');
      try {
        await this.#store.deleteTerminal(terminal.id);
      } finally {
        release();
      }
      return {};
    });
  }

  async *attachTerminal(
    requests: AsyncIterable<AttachTerminalRequest>,
    { signal }: HandlerContext,
  ): AsyncGenerator<AttachEvent> {
    const iterator = requests[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done || first.value.event.case !== 'open') {
      throw new TransportError(Code.INVALID_ARGUMENT, 'the first request must open the stream');
    }
    const open = first.value.event.value;
    const requestedSize = open.size ? guardSize(open.size) : undefined;
    const shell = await attempt(() => this.#openShell(open.terminalId, requestedSize));

    let queue: ShellEvent[] = [];
    let queued = 0; // The bytes of output in the queue.
    let resyncing = false;
    let wake: (() => void) | undefined;
    let failure: unknown;
    const notify = () => wake?.();
    const listener = (event: ShellEvent) => {
      switch (event.case) {
        case 'output':
          if (resyncing) {
            return; // Applied before the buffer is sent, these bytes will be covered by the sending buffer.
          }
          queued += event.value.byteLength;
          if (queued > this.#options.maxQueuedBytes) {
            // The client is not keeping up, so a buffer taken after this output replaces the output it has not read.
            queue = queue.filter((held) => held.case !== 'output' && held.case !== 'buffer');
            queued = 0;
            resyncing = true;
            shell.resync(listener);
            return;
          }
          break;
        case 'buffer':
          resyncing = false;
          break;
      }
      queue.push(event);
      notify();
    };
    const detach = await shell.attach(listener);
    signal.addEventListener('abort', notify, { once: true });

    // Handles incoming messages.
    void (async () => {
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
        const { event } = next.value;
        switch (event.case) {
          case 'open':
            throw new TransportError(Code.INVALID_ARGUMENT, 'the stream is already open');
          case 'input':
            shell.write(event.value);
            break;
          case 'resize':
            shell.resize(guardSize(event.value));
            break;
          default:
            throw new TransportError(Code.INVALID_ARGUMENT, 'the request carries no event');
        }
      }
    })().catch((error: unknown) => {
      failure = error;
      notify();
    });

    // Handles outgoing messages.
    try {
      while (!signal.aborted) {
        if (failure) {
          throw failure;
        }
        const next = queue.shift();
        if (next) {
          if (next.case === 'exit') {
            yield { event: { case: 'exit', value: { cause: next.value } } };
            return;
          }
          if (next.case === 'output') {
            queued -= next.value.byteLength;
          }
          yield { event: next };
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    } finally {
      detach();
      signal.removeEventListener('abort', notify);
    }
  }

  /** Returns the terminal's shell and starts the shell if stopped. */
  async #openShell(terminalId: string, size: Size | undefined): Promise<Shell> {
    const terminal = await this.#refuseMissingTerminal(terminalId);
    const running = this.#shells.get(terminal.id);
    if (running) {
      if (size) {
        running.resize(size);
      }
      return running;
    }
    const workspace = await this.#store.getWorkspace(terminal.workspace_id);
    if (!workspace) {
      throw new TransportError(Code.NOT_FOUND, 'the workspace does not exist');
    }
    const cwd = toNativeRoot(workspace.absolute_path);
    await refuseMissingDirectory(cwd);
    try {
      return await this.#shells.start(terminal.id, cwd, size);
    } catch (error) {
      if (error instanceof TransportError) {
        throw error;
      }
      throw new TransportError(Code.FAILED_PRECONDITION, `the shell could not start: ${messageOf(error)}`);
    }
  }

  async #refuseMissingTerminal(terminalId: string): Promise<TerminalRow> {
    const row = await this.#store.getTerminal(terminalId);
    if (!row) {
      throw new TransportError(Code.NOT_FOUND, 'the terminal does not exist');
    }
    return row;
  }

  #terminalOf(terminal: TerminalRow): TerminalInit {
    const state = this.#shells.stateOf(terminal);
    return {
      workspaceId: terminal.workspace_id,
      id: terminal.id,
      name: terminal.name,
      state:
        state.case === 'exited'
          ? { case: 'exited', value: { exit: { cause: state.value } } }
          : { case: state.case, value: {} },
      clients: this.#shells.clientsOf(terminal.id),
    };
  }
}

function guardSize(size: SizeMessage): Size {
  const { columns, rows } = size;
  if (columns < 1 || rows < 1 || columns > MAX_CELLS || rows > MAX_CELLS) {
    throw new TransportError(Code.INVALID_ARGUMENT, `${columns}x${rows} is not a valid size`);
  }
  return { columns, rows };
}

async function refuseMissingDirectory(nativePath: string): Promise<void> {
  try {
    if (!(await fs.stat(nativePath)).isDirectory()) {
      throw new TransportError(Code.FAILED_PRECONDITION, 'the path is not a directory');
    }
  } catch (error) {
    if (errnoOf(error) === 'ENOENT' || errnoOf(error) === 'ENOTDIR') {
      throw new TransportError(Code.FAILED_PRECONDITION, 'the directory does not exist');
    }
    throw error;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
