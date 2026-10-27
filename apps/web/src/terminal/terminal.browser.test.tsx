import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ITerminalAddon, Terminal as XTerm } from '@xterm/xterm';
import { createRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { resolveActiveTheme, THEMES } from '@/appearance/themes';
import { settingsQuery } from '@/settings/settings';
import { Terminal } from '@/terminal/terminal';

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  appearance: {
    ...DEFAULT_SETTINGS.appearance,
    general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light' },
  },
};

function session() {
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

async function mount(fake: ITerminalAddon) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, SETTINGS);
  const ref = createRef<XTerm | null>();
  const screen = await render(
    <QueryClientProvider client={client}>
      <div data-testid="frame" style={{ height: 300, width: 600 }}>
        <Terminal ref={ref} session={fake} />
      </div>
    </QueryClientProvider>,
  );
  await expect.poll(() => ref.current).not.toBeNull();
  return { client, screen, xterm: ref.current as XTerm };
}

function line(xterm: XTerm, row: number): string {
  return xterm.buffer.active.getLine(row)?.translateToString(true) ?? '';
}

describe('Terminal', () => {
  test('activates session', async () => {
    const fake = session();
    const { xterm } = await mount(fake);
    expect(fake.terminal).toBe(xterm);

    fake.terminal?.write('hello\r\nworld');

    await expect.poll(() => line(xterm, 0)).toBe('hello');
    expect(line(xterm, 1)).toBe('world');
  });

  test('sends input', async () => {
    const fake = session();
    const { xterm } = await mount(fake);

    xterm.focus();
    await userEvent.keyboard('ls');

    await expect.poll(() => fake.write.mock.calls.map(([data]) => data).join('')).toBe('ls');
  });

  test('fits host', async () => {
    const fake = session();
    const { xterm, screen } = await mount(fake);
    expect(fake.resize).toHaveBeenLastCalledWith(xterm.cols, xterm.rows);
    const cols = xterm.cols;

    (screen.getByTestId('frame').element() as HTMLElement).style.width = '900px';

    await expect.poll(() => xterm.cols).toBeGreaterThan(cols);
    expect(fake.resize).toHaveBeenLastCalledWith(xterm.cols, xterm.rows);
  });

  describe('unfocused cursor', () => {
    test('hollows block', async () => {
      const { xterm } = await mount(session());
      expect(xterm.options.cursorStyle).toBe('block');

      xterm.focus();
      await expect.poll(() => xterm.element?.classList.contains('focus')).toBe(true);
      xterm.blur();

      await expect.poll(() => xterm.element?.classList.contains('focus')).toBe(false);
      expect(xterm.options.cursorInactiveStyle).toBe('outline');
    });

    test('keeps bar', async () => {
      const { client, xterm } = await mount(session());
      client.setQueryData(settingsQuery.queryKey, {
        ...SETTINGS,
        appearance: { ...SETTINGS.appearance, terminal: { ...SETTINGS.appearance.terminal, cursorStyle: 'bar' } },
      } satisfies Settings);
      await expect.poll(() => xterm.options.cursorStyle).toBe('bar');

      xterm.focus();
      await expect.poll(() => xterm.element?.classList.contains('focus')).toBe(true);
      xterm.blur();

      await expect.poll(() => xterm.element?.classList.contains('focus')).toBe(false);
      expect(xterm.options.cursorInactiveStyle).toBe('bar');
    });
  });

  test('follows settings', async () => {
    const fake = session();
    const { client, xterm } = await mount(fake);
    const elsewise = resolveActiveTheme(THEMES, { source: 'elsewise', name: 'elsewise' }, 'light').terminal;
    await expect.poll(() => xterm.options.fontSize).toBe(12);
    expect(xterm.options.lineHeight).toBe(1.0625);
    expect(xterm.options.cursorStyle).toBe('block');
    expect(xterm.options.theme?.background).toBe(elsewise.background);

    client.setQueryData(settingsQuery.queryKey, {
      ...SETTINGS,
      appearance: {
        ...SETTINGS.appearance,
        terminal: {
          theme: { source: 'elsewise', name: 'dracula' },
          font: { family: null, size: 16, lineHeight: 1.2, ligatures: false },
          cursorStyle: 'bar',
          cursorBlink: false,
          scrollback: 2000,
        },
      },
    } satisfies Settings);

    const { selection, ...dracula } = resolveActiveTheme(
      THEMES,
      { source: 'elsewise', name: 'dracula' },
      'light',
    ).terminal;
    await expect.poll(() => xterm.options.fontSize).toBe(16);
    expect(xterm.options.lineHeight).toBe(1.2);
    expect(xterm.options.cursorStyle).toBe('bar');
    expect(xterm.options.cursorBlink).toBe(false);
    expect(xterm.options.scrollback).toBe(2000);
    expect(xterm.options.theme).toEqual({ ...dracula, selectionBackground: selection });
  });
});
