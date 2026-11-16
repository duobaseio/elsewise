import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ITerminalAddon, Terminal as XTerm } from '@xterm/xterm';
import { createRef } from 'react';
import { expect, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { Daemon } from '@/daemon';
import {
  type AttachTerminalRequestSchema,
  type AttachTerminalResponse,
  AttachTerminalResponseSchema,
  TerminalService,
} from '@/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { settingsQuery } from '@/settings/settings';
import { Terminal } from '@/terminal/terminal';
import { TerminalManager } from '@/terminal/terminal-manager';
import { builtInApplication } from './commands';

export const SETTINGS: FrontendSettings = {
  ...DEFAULT_FRONTEND_SETTINGS,
  appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, brightness: 'light' },
};

export function session() {
  const fake = {
    write: vi.fn<(data: string) => void>(),
    resize: vi.fn<(cols: number, rows: number) => void>(),
    terminal: null as XTerm | null,
    activate(terminal: XTerm) {
      fake.terminal = terminal;
      terminal.onData(fake.write);
      terminal.onResize(({ cols, rows }) => fake.resize(cols, rows));
    },
    dispose() {},
  };
  return fake;
}

export async function mount(fake: ITerminalAddon, settings = SETTINGS, preview = false) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  const terminals = new TerminalManager();
  const application = builtInApplication({ terminal: terminals });
  const commands = application.commands;
  const ref = createRef<XTerm | null>();
  const screen = await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <ApplicationManagerContext value={application}>
          <div data-testid="frame" style={{ height: 300, width: 600 }}>
            <Terminal ref={ref} session={fake} preview={preview} />
          </div>
        </ApplicationManagerContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.poll(() => ref.current).not.toBeNull();
  return { client, commands, screen, terminals, xterm: ref.current as XTerm };
}

// Right-clicks the terminal, holding `key` if given. Leaves the selection to the test unless `selectsWord`, when the
// click selects the word at `position`, as it does by default on macOS.
export async function rightClick(
  xterm: XTerm,
  {
    key,
    selectsWord = false,
    position,
  }: { key?: 'Shift' | 'Alt'; selectsWord?: boolean; position?: { x: number; y: number } } = {},
) {
  xterm.options.rightClickSelectsWord = selectsWord;
  const screen = xterm.element?.querySelector('.xterm-screen') as HTMLElement;
  if (key !== undefined) {
    await userEvent.keyboard(`{${key}>}`);
  }
  await userEvent.click(page.elementLocator(screen), { button: 'right', position });
  if (key !== undefined) {
    await userEvent.keyboard(`{/${key}}`);
  }
}

// A daemon's terminals, whose attach records what the client sends and responds with what `respond` is given, or fails
// with what `fail` is given.
export function terminals(overrides: Partial<Daemon['terminals']> = {}) {
  const sent: MessageInitShape<typeof AttachTerminalRequestSchema>[] = [];
  const pending: AttachTerminalResponse[] = [];
  let failure: Error | undefined;
  let cancelled = false;
  let wake: (() => void) | undefined;
  const attachTerminal = () => ({
    send: async (request: MessageInitShape<typeof AttachTerminalRequestSchema>) => void sent.push(request),
    close() {},
    cancel() {
      cancelled = true;
      wake?.();
    },
    responses: (async function* () {
      while (!cancelled) {
        if (failure !== undefined) {
          throw failure;
        }
        const next = pending.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    })(),
  });
  const client = {
    ...Object.fromEntries(
      TerminalService.methods.map((method) => [
        method.localName,
        () => {
          throw new Error('not faked');
        },
      ]),
    ),
    attachTerminal,
    ...overrides,
  } as unknown as Daemon['terminals'];
  return {
    client,
    sent,
    cancelled: () => cancelled,
    respond(...events: MessageInitShape<typeof AttachTerminalResponseSchema>['event'][]) {
      pending.push(...events.map((event) => create(AttachTerminalResponseSchema, { event })));
      wake?.();
    },
    fail(error: Error) {
      failure = error;
      wake?.();
    },
  };
}
