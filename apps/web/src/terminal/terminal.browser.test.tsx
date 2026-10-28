import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ITerminalAddon, Terminal as XTerm } from '@xterm/xterm';
import { createRef } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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

afterEach(() => {
  vi.restoreAllMocks();
});

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

async function mount(fake: ITerminalAddon, settings = SETTINGS) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
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

// Drags the mouse across `text`, the first thing on the first row.
async function select(xterm: XTerm, text: string) {
  const screen = xterm.element?.querySelector('.xterm-screen') as HTMLElement;
  const { left, top } = screen.getBoundingClientRect();
  const cell = { width: screen.clientWidth / xterm.cols, height: screen.clientHeight / xterm.rows };
  const y = top + cell.height / 2;
  screen.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1, detail: 1, clientX: left + 1, clientY: y }),
  );
  const at = { bubbles: true, button: 0, buttons: 1, clientX: left + cell.width * text.length - 1, clientY: y };
  document.dispatchEvent(new MouseEvent('mousemove', at));
  document.dispatchEvent(new MouseEvent('mouseup', at));
  await expect.poll(() => xterm.getSelection()).toBe(text);
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

  describe('copy on select', () => {
    test('copies selection', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      const { xterm } = await mount(session(), {
        ...SETTINGS,
        appearance: { ...SETTINGS.appearance, terminal: { ...SETTINGS.appearance.terminal, copyOnSelect: true } },
      });
      await new Promise<void>((resolve) => xterm.write('hello world', resolve));

      await select(xterm, 'hello');

      expect(writeText.mock.calls).toEqual([['hello']]);
    });

    test('leaves clipboard when off', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      const { xterm } = await mount(session());
      await new Promise<void>((resolve) => xterm.write('hello world', resolve));

      await select(xterm, 'hello');

      expect(xterm.getSelection()).toBe('hello');
      expect(writeText).not.toHaveBeenCalled();
    });

    test('copies double-clicked word', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      const { xterm } = await mount(session(), {
        ...SETTINGS,
        appearance: { ...SETTINGS.appearance, terminal: { ...SETTINGS.appearance.terminal, copyOnSelect: true } },
      });
      await new Promise<void>((resolve) => xterm.write('hello world', resolve));

      const screen = xterm.element?.querySelector('.xterm-screen') as HTMLElement;
      const { left, top } = screen.getBoundingClientRect();
      const at = { bubbles: true, button: 0, clientX: left + 2, clientY: top + 2 };
      screen.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1, detail: 2 }));
      document.dispatchEvent(new MouseEvent('mouseup', at));
      await expect.poll(() => xterm.getSelection()).toBe('hello');

      await expect.poll(() => writeText.mock.calls).toEqual([['hello']]);
    });

    test('leaves clipboard on click keeping selection', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      const { xterm } = await mount(session(), {
        ...SETTINGS,
        appearance: { ...SETTINGS.appearance, terminal: { ...SETTINGS.appearance.terminal, copyOnSelect: true } },
      });
      await new Promise<void>((resolve) => xterm.write('hello world', resolve));
      xterm.select(0, 0, 5);

      // A middle click, which leaves the selection alone.
      const screen = xterm.element?.querySelector('.xterm-screen') as HTMLElement;
      screen.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 1, buttons: 4, detail: 1 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 1 }));

      expect(xterm.getSelection()).toBe('hello');
      expect(writeText).not.toHaveBeenCalled();
    });

    test('copies mouse selection while finding', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      const { xterm } = await mount(session(), {
        ...SETTINGS,
        appearance: { ...SETTINGS.appearance, terminal: { ...SETTINGS.appearance.terminal, copyOnSelect: true } },
      });
      const field = await find(xterm, 'hello world');
      await userEvent.fill(field, 'world');
      await expect.element(page.getByRole('status')).toHaveTextContent('1/1');

      await select(xterm, 'hello');

      expect(writeText.mock.calls).toEqual([['hello']]);
    });

    test('leaves matches off clipboard', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      const { xterm } = await mount(session(), {
        ...SETTINGS,
        appearance: { ...SETTINGS.appearance, terminal: { ...SETTINGS.appearance.terminal, copyOnSelect: true } },
      });
      const field = await find(xterm, 'hello');

      await userEvent.fill(field, 'hello');
      await expect.element(page.getByRole('status')).toHaveTextContent('1/1');

      expect(xterm.getSelection()).toBe('hello');
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  test('follows settings', async () => {
    const fake = session();
    const { client, xterm } = await mount(fake);
    const elsewise = resolveActiveTheme(THEMES, { source: 'elsewise', name: 'elsewise' }, 'light').terminal;
    await expect.poll(() => xterm.options.fontSize).toBe(12);
    expect(xterm.options.lineHeight).toBe(1.0625);
    expect(xterm.options.cursorStyle).toBe('block');
    expect(xterm.options.macOptionIsMeta).toBe(false);
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
          copyOnSelect: false,
          macOptionIsMeta: true,
          scrollback: 2000,
        },
      },
    } satisfies Settings);

    const { selection, searchMatch, searchMatchSelected, searchMatchSelectedBorder, ...dracula } = resolveActiveTheme(
      THEMES,
      { source: 'elsewise', name: 'dracula' },
      'light',
    ).terminal;
    await expect.poll(() => xterm.options.fontSize).toBe(16);
    expect(xterm.options.lineHeight).toBe(1.2);
    expect(xterm.options.cursorStyle).toBe('bar');
    expect(xterm.options.cursorBlink).toBe(false);
    expect(xterm.options.macOptionIsMeta).toBe(true);
    expect(xterm.options.scrollback).toBe(2000);
    expect(xterm.options.theme).toEqual({ ...dracula, selectionBackground: selection });
  });
});
