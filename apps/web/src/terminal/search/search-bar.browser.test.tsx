import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Terminal as XTerm } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CommandManagerContext } from '@/command/command-manager';
import { terminalKeymap } from '@/command/keymap';
import { settingsQuery } from '@/settings/settings';
import { TerminalSearch } from '@/terminal/search/search-bar';
import { builtInCommands } from '../../../test/commands';

import '@xterm/xterm/css/xterm.css';

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  appearance: {
    ...DEFAULT_SETTINGS.appearance,
    general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light' },
  },
};

// Renders a bare terminal with the commands' keymap and its search. Returns the settings' client and the terminal.
async function mount() {
  const commands = builtInCommands();
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, SETTINGS);
  let resolve!: (xterm: XTerm) => void;
  const ready = new Promise<XTerm>((r) => {
    resolve = r;
  });
  function Probe() {
    const [keymap] = useState(() => terminalKeymap(commands));
    const [terminal, setTerminal] = useState<XTerm | null>(null);
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (host.current === null) {
        return;
      }
      // The search add-on's highlights reach proposed API.
      const xterm = new XTerm({ allowProposedApi: true });
      xterm.loadAddon(keymap);
      xterm.open(host.current);
      setTerminal(xterm);
      resolve(xterm);
      return () => xterm.dispose();
    }, [keymap]);
    return (
      <div className="relative" style={{ height: 300, width: 600 }}>
        <div className="h-full" ref={host} />
        <TerminalSearch terminal={terminal} />
      </div>
    );
  }
  await render(
    <QueryClientProvider client={client}>
      <CommandManagerContext value={commands}>
        <Probe />
      </CommandManagerContext>
    </QueryClientProvider>,
  );
  return { client, xterm: await ready };
}

// Writes `text`, then opens the search bar with its shortcut.
async function find(xterm: XTerm, text: string) {
  await new Promise<void>((resolve) => xterm.write(text, resolve));
  xterm.focus();
  await userEvent.keyboard(PLATFORM === 'mac' ? '{Meta>}f{/Meta}' : '{Control>}{Shift>}f{/Shift}{/Control}');
  const field = page.getByRole('textbox', { name: 'Find' });
  await expect.element(field).toHaveFocus();
  return field;
}

describe('TerminalSearch', () => {
  test('opens with selected line', async () => {
    const { xterm } = await mount();
    await new Promise<void>((resolve) => xterm.write('hello world\r\nhello again', resolve));
    xterm.select(0, 0, 5);

    const field = await find(xterm, '');

    await expect.element(field).toHaveValue('hello');
    await expect.element(page.getByRole('status')).toHaveTextContent('1/2');
  });

  test('replaces query with selected line when open', async () => {
    const { xterm } = await mount();
    const field = await find(xterm, 'hello world');
    await userEvent.fill(field, 'hello');
    await expect.element(page.getByRole('status')).toHaveTextContent('1/1');
    xterm.select(6, 0, 5);

    await find(xterm, '');

    await expect.element(field).toHaveValue('world');
    await expect.element(page.getByRole('status')).toHaveTextContent('1/1');
  });

  test('moves between matches', async () => {
    const { xterm } = await mount();
    const field = await find(xterm, 'one two one');
    await userEvent.fill(field, 'one');
    await expect.element(page.getByRole('status')).toHaveTextContent('1/2');

    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByRole('status')).toHaveTextContent('2/2');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');

    await expect.element(page.getByRole('status')).toHaveTextContent('1/2');
  });

  test('matches case on demand', async () => {
    const { xterm } = await mount();
    const field = await find(xterm, 'Hello hello');
    await userEvent.fill(field, 'hello');
    await expect.element(page.getByRole('status')).toHaveTextContent('1/2');

    await userEvent.click(page.getByRole('button', { name: 'Match case' }));

    await expect.element(page.getByRole('status')).toHaveTextContent('1/1');
  });

  test('counts 1000 matches exactly', async () => {
    const { xterm } = await mount();
    const field = await find(xterm, 'x '.repeat(1000));
    await userEvent.fill(field, 'x');

    await expect.element(page.getByRole('status')).toHaveTextContent('1/1000');
    await expect.element(page.getByRole('status')).not.toHaveTextContent('+');
  });

  test('caps count past 1000 matches', async () => {
    const { xterm } = await mount();
    const field = await find(xterm, 'x '.repeat(1001));
    await userEvent.fill(field, 'x');

    await expect.element(page.getByRole('status')).toHaveTextContent('1/1000+');
  });

  test('says when nothing matches', async () => {
    const { xterm } = await mount();
    const field = await find(xterm, 'hello');

    await userEvent.fill(field, 'bye');

    await expect.element(page.getByRole('status')).toHaveTextContent('No results');
  });

  test('reopens with last options', async () => {
    const { xterm } = await mount();
    const field = await find(xterm, 'a1 b2');
    await userEvent.fill(field, '[ab]\\d');
    await userEvent.click(page.getByRole('button', { name: 'Regex' }));
    await expect.element(page.getByRole('status')).toHaveTextContent('1/2');
    await userEvent.keyboard('{Escape}');
    xterm.clearSelection();

    await find(xterm, '');

    await expect.element(page.getByRole('textbox', { name: 'Find' })).toHaveValue('[ab]\\d');
    await expect.element(page.getByRole('button', { name: 'Regex' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('status')).toHaveTextContent('1/2');
  });

  test('recolors matches with theme', async () => {
    const { client, xterm } = await mount();
    const field = await find(xterm, 'hello');
    await userEvent.fill(field, 'hello');
    // Only the current match is outlined.
    const current = () =>
      [...(xterm.element?.querySelectorAll<HTMLElement>('.xterm-find-result-decoration') ?? [])]
        .map((match) => match.style.outlineColor)
        .find((color) => color !== '');
    await expect.poll(current).toBe('rgb(143, 106, 36)');

    client.setQueryData(settingsQuery.queryKey, {
      ...SETTINGS,
      appearance: {
        ...SETTINGS.appearance,
        general: { ...SETTINGS.appearance.general, brightness: 'dark' },
      },
    } satisfies Settings);

    await expect.poll(current).toBe('rgb(217, 179, 106)');
  });

  test('closes on escape, refocusing terminal', async () => {
    const { xterm } = await mount();
    await find(xterm, 'hello');

    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('textbox', { name: 'Find' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(xterm.textarea);
  });
});
