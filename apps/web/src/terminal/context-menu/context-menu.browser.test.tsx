import { PLATFORM } from '@elsewise/components/lib/platform';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount, rightClick, SETTINGS, session } from '../../../test/terminal';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TerminalContextMenu', () => {
  test('shows added group', async () => {
    const { commands, terminals, xterm } = await mount(session());
    commands.add([{ id: 'shrug', label: 'Shrug', scope: 'terminal', run: () => true }]);
    terminals.addContextMenu([{ id: 'reactions', order: 50, items: [{ order: 10, command: 'shrug' }] }]);

    await rightClick(xterm);

    await expect.element(page.getByRole('menuitem', { name: 'Shrug' })).toBeVisible();
  });

  test('focuses terminal before running item', async () => {
    const { commands, terminals, xterm } = await mount(session());
    let focused: Element | null = null;
    commands.add([
      {
        id: 'shrug',
        label: 'Shrug',
        scope: 'terminal',
        run: () => {
          focused = document.activeElement;
          return true;
        },
      },
    ]);
    terminals.addContextMenu([{ id: 'reactions', order: 50, items: [{ order: 10, command: 'shrug' }] }]);
    await rightClick(xterm);

    await userEvent.click(page.getByRole('menuitem', { name: 'Shrug' }));

    await expect.poll(() => focused).toBe(xterm.textarea);
  });

  test('ignores right-click while program tracks mouse', async () => {
    const { xterm } = await mount(session());
    await new Promise<void>((resolve) => xterm.write('\x1b[?1000h', resolve));

    await rightClick(xterm);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(page.getByRole('menu').query()).toBeNull();
  });

  test('ignores long-press while program tracks mouse', async () => {
    const { xterm } = await mount(session());
    await new Promise<void>((resolve) => xterm.write('\x1b[?1000h', resolve));
    const screen = xterm.element?.querySelector('.xterm-screen') as HTMLElement;
    const { left, top } = screen.getBoundingClientRect();
    const touch = new Touch({ identifier: 1, target: screen, clientX: left + 4, clientY: top + 4 });

    screen.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch], targetTouches: [touch] }));

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(page.getByRole('menu').query()).toBeNull();
  });

  test('opens with override key while program tracks mouse', async () => {
    const { xterm } = await mount(session(), {
      ...SETTINGS,
      appearance: {
        ...SETTINGS.appearance,
        terminal: { ...SETTINGS.appearance.terminal, macOptionClickForcesSelection: true },
      },
    });
    await new Promise<void>((resolve) => xterm.write('\x1b[?1000h', resolve));

    await rightClick(xterm, { key: PLATFORM === 'mac' ? 'Alt' : 'Shift' });

    await expect.element(page.getByRole('menuitem', { name: /Paste/ })).toBeVisible();
  });

  test.runIf(PLATFORM === 'mac')('ignores shift right-click while program tracks mouse', async () => {
    const { xterm } = await mount(session());
    await new Promise<void>((resolve) => xterm.write('\x1b[?1000h', resolve));

    await rightClick(xterm, { key: 'Shift' });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(page.getByRole('menu').query()).toBeNull();
  });
});
