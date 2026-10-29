import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ITerminalAddon, Terminal as XTerm } from '@xterm/xterm';
import { createRef } from 'react';
import { expect, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CommandManagerContext } from '@/command/command-manager';
import { EditorManager } from '@/editor/editor-manager';
import { settingsQuery } from '@/settings/settings';
import { Terminal } from '@/terminal/terminal';
import { TerminalManager, TerminalManagerContext } from '@/terminal/terminal-manager';
import { builtInCommands } from './commands';

export const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  appearance: {
    ...DEFAULT_SETTINGS.appearance,
    general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light' },
  },
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
  const commands = builtInCommands(new EditorManager(), terminals);
  const ref = createRef<XTerm | null>();
  const screen = await render(
    <QueryClientProvider client={client}>
      <TerminalManagerContext value={terminals}>
        <CommandManagerContext value={commands}>
          <div data-testid="frame" style={{ height: 300, width: 600 }}>
            <Terminal ref={ref} session={fake} preview={preview} />
          </div>
        </CommandManagerContext>
      </TerminalManagerContext>
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
