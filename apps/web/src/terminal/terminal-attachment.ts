import type { MessageInitShape } from '@bufbuild/protobuf';
import type { TerminalExit } from '@elsewise/frontend-plugin';
import type { BidiCall, Client } from '@elsewise/transport';
import type { IDisposable, ITerminalAddon, Terminal as XTerm } from '@xterm/xterm';
import type {
  AttachTerminalRequestSchema,
  AttachTerminalResponse,
  TerminalService,
} from '@/gen/elsewise/daemon/terminal/v1/terminal_service_pb';

type Request = MessageInitShape<typeof AttachTerminalRequestSchema>;
type Call = BidiCall<Request, AttachTerminalResponse>;

/**
 * A terminal's attachment to a PTY managed by the daemon.
 */
export class TerminalAttachment implements ITerminalAddon {
  private readonly disposables: IDisposable[] = [];
  private terminal: XTerm | null = null;
  private call: Call | null = null;

  constructor(
    private readonly terminals: Client<typeof TerminalService>,
    private readonly terminalId: string,
    private onStart: (() => void) | undefined,
    private readonly onExit: (exit: TerminalExit) => void,
  ) {}

  activate(terminal: XTerm): void {
    this.terminal = terminal;
    this.call = this.terminals.attachTerminal();

    const encoder = new TextEncoder();
    this.disposables.push(
      terminal.onData((data) => this.send({ event: { case: 'input', value: encoder.encode(data) } })),
      terminal.onBinary((data) =>
        this.send({ event: { case: 'input', value: Uint8Array.from(data, (char) => char.charCodeAt(0)) } }),
      ),
      terminal.onResize(({ cols, rows }) => this.send({ event: { case: 'resize', value: { columns: cols, rows } } })),
    );
    this.send({
      event: {
        case: 'open',
        value: { terminalId: this.terminalId, size: { columns: terminal.cols, rows: terminal.rows } },
      },
    });
    void this.receive(this.call);
  }

  private send(request: Request): void {
    this.call?.send(request).catch(() => {});
  }

  private async receive(call: Call): Promise<void> {
    try {
      for await (const { event } of call.responses) {
        const terminal = this.terminal;
        if (this.call !== call || terminal === null) {
          return;
        }

        switch (event.case) {
          case 'buffer':
            terminal.reset();
            terminal.write(event.value);
            break;
          case 'output':
            this.onStart?.();
            this.onStart = undefined;
            terminal.write(event.value);
            break;
          case 'exit': {
            const { cause } = event.value;
            this.onExit(cause.case === 'signal' ? { signal: cause.value } : { code: cause.value ?? 0 });
            return;
          }
        }
      }
    } catch (error) {
      if (this.call === call) {
        this.terminal?.write(`\r\n\x1b[2m${(error as Error).message}\x1b[0m\r\n`);
      }
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.call?.cancel();
    this.call = null;
    this.terminal = null;
  }
}
