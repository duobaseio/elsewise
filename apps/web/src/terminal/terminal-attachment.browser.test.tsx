import type { Terminal as XTerm } from '@xterm/xterm';
import { describe, expect, test, vi } from 'vitest';
import { TerminalAttachment } from '@/terminal/terminal-attachment';
import { mount, terminals } from '../../test/terminal';

function line(xterm: XTerm, row: number): string {
  return xterm.buffer.active.getLine(row)?.translateToString(true) ?? '';
}

async function attach() {
  const fake = terminals();
  const onStart = vi.fn();
  const onExit = vi.fn();
  const attachment = new TerminalAttachment(fake.client, 'tokyo-1', onStart, onExit);
  const { screen, xterm } = await mount(attachment);
  return { ...fake, attachment, onExit, onStart, screen, xterm };
}

describe('activate', () => {
  test('opens with terminal size', async () => {
    const { sent } = await attach();

    expect(sent[0]).toEqual({
      event: { case: 'open', value: { terminalId: 'tokyo-1', size: { columns: 80, rows: 24 } } },
    });
  });

  test('sends resize', async () => {
    const { sent, xterm } = await attach();

    xterm.resize(40, 10);

    expect(sent.at(-1)).toEqual({ event: { case: 'resize', value: { columns: 40, rows: 10 } } });
  });

  test('writes buffer, then output', async () => {
    const { respond, xterm } = await attach();

    respond(
      { case: 'size', value: { columns: 40, rows: 10 } },
      { case: 'clients', value: 1 },
      { case: 'buffer', value: new TextEncoder().encode('\x1b[31mhello') },
      { case: 'output', value: new TextEncoder().encode(' world') },
    );

    await expect.poll(() => line(xterm, 0)).toBe('hello world');
  });

  test('sends input', async () => {
    const { sent, xterm } = await attach();

    xterm.input('ls\r');

    expect(sent.at(-1)).toEqual({ event: { case: 'input', value: new TextEncoder().encode('ls\r') } });
  });

  test('calls onStart on first output', async () => {
    const { onStart, respond } = await attach();

    respond(
      { case: 'buffer', value: new TextEncoder().encode('saved') },
      { case: 'output', value: new TextEncoder().encode('$ ') },
      { case: 'output', value: new TextEncoder().encode('ls') },
    );

    await expect.poll(() => onStart).toHaveBeenCalledOnce();
  });

  test('calls onExit on exit', async () => {
    const { onExit, respond } = await attach();

    respond({ case: 'exit', value: { cause: { case: 'code', value: 0 } } });

    await expect.poll(() => onExit).toHaveBeenCalledOnce();
  });

  test('writes failure', async () => {
    const { fail, xterm } = await attach();

    fail(new Error('the terminal does not exist'));

    await expect.poll(() => line(xterm, 1)).toBe('the terminal does not exist');
  });
});

describe('dispose', () => {
  test('cancels call', async () => {
    const { cancelled, screen, xterm } = await attach();
    await screen.unmount();

    xterm.dispose();

    expect(cancelled()).toBe(true);
  });
});
