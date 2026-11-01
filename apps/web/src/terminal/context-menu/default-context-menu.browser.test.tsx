import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount, rightClick, SETTINGS, session } from '../../../test/terminal';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DEFAULT_CONTEXT_MENU', () => {
  test('shows copy for selection', async () => {
    const { xterm } = await mount(session());
    await new Promise<void>((resolve) => xterm.write('hello world', resolve));
    xterm.select(0, 0, 5);

    await rightClick(xterm);

    await expect.element(page.getByRole('menuitem', { name: /Copy/ })).toBeVisible();
    await expect.element(page.getByRole('menuitem', { name: /Paste/ })).toBeVisible();
    await expect.element(page.getByRole('menuitem', { name: /Find/ })).toBeVisible();
  });

  test('hides copy without selection', async () => {
    const { xterm } = await mount(session());

    await rightClick(xterm);

    await expect.element(page.getByRole('menuitem', { name: /Paste/ })).toBeVisible();
    expect(page.getByRole('menuitem', { name: /Copy/ }).query()).toBeNull();
  });

  test('pastes from menu', async () => {
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('pasted');
    const fake = session();
    const { xterm } = await mount(fake);
    await rightClick(xterm);

    await userEvent.click(page.getByRole('menuitem', { name: /Paste/ }));

    await expect.poll(() => fake.write.mock.calls).toEqual([['pasted']]);
  });

  test('pastes clipboard, not right-clicked word', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('pasted');
    const fake = session();
    const { xterm } = await mount(fake, {
      ...SETTINGS,
      appearance: { ...SETTINGS.appearance, terminal: { ...SETTINGS.appearance.terminal, copyOnSelect: true } },
    });
    await new Promise<void>((resolve) => xterm.write('hello world', resolve));
    await rightClick(xterm, { selectsWord: true, position: { x: 4, y: 4 } });
    await expect.poll(() => xterm.getSelection()).toBe('hello');

    await userEvent.click(page.getByRole('menuitem', { name: /Paste/ }));

    await expect.poll(() => fake.write.mock.calls).toEqual([['pasted']]);
    expect(writeText).not.toHaveBeenCalled();
  });

  test('disables paste in read-only terminal', async () => {
    const { xterm } = await mount(session());
    xterm.options.disableStdin = true;

    await rightClick(xterm);

    await expect.element(page.getByRole('menuitem', { name: /Paste/ })).toHaveAttribute('aria-disabled', 'true');
  });

  test('selects all from menu', async () => {
    const { xterm } = await mount(session());
    await new Promise<void>((resolve) => xterm.write('hello world', resolve));
    await rightClick(xterm);

    await userEvent.click(page.getByRole('menuitem', { name: /Select all/ }));

    await expect.poll(() => xterm.getSelection().trim()).toBe('hello world');
  });

  test('clears from menu', async () => {
    const { xterm } = await mount(session());
    const lines = Array.from({ length: xterm.rows * 2 }, (_, i) => String(i));
    await new Promise<void>((resolve) => xterm.write(lines.join('\r\n'), resolve));
    await rightClick(xterm);

    await userEvent.click(page.getByRole('menuitem', { name: /Clear/ }));

    await expect.poll(() => xterm.buffer.active.length).toBe(xterm.rows);
    expect(xterm.buffer.active.getLine(0)?.translateToString(true)).toBe(lines.at(-1));
  });

  test('opens find from menu', async () => {
    const { xterm } = await mount(session());
    await rightClick(xterm);

    await userEvent.click(page.getByRole('menuitem', { name: /Find/ }));

    await expect.element(page.getByRole('textbox', { name: 'Find' })).toHaveFocus();
  });
});
