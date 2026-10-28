import type { ApplicationCommand } from '@elsewise/plugin';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager } from '@/command/command-manager';
import { ELSEWISE, installApplicationKeys, type LoadedKeymap, resolveKeymap } from '@/command/keymap';
import { EditorManager } from '@/editor/editor-manager';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';
import { memoryRouter } from '../../test/commands';

const APPEARANCE = new AppearanceManager(
  'dark',
  resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark'),
);

const ECLIPSE: LoadedKeymap = {
  id: { source: 'plugin', plugin: 'io.example', name: 'Eclipse' },
  keymap: { name: 'Eclipse', keys: {} },
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Returns a window with application keys installed for `added`, which are added in order.
function install(...added: ApplicationCommand[]) {
  const window = new EventTarget() as Window;
  const commands = new CommandManager({
    appearance: APPEARANCE,
    editor: new EditorManager(),
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
    terminal: new TerminalManager(),
  });
  for (const command of added) {
    commands.add([command]);
  }
  const dispose = installApplicationKeys(window, commands);
  return { window, dispose };
}

// Returns a cancelable keydown that presses Ctrl-k, with `init` overriding its properties.
function press(init: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return Object.assign(new Event('keydown', { cancelable: true }), {
    key: 'k',
    keyCode: 75,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...init,
  }) as KeyboardEvent;
}

// Returns an application command `id` bound to Ctrl-k.
function command(id: string, run: () => boolean, enabled = true): ApplicationCommand {
  return { id, label: id, scope: 'application', defaultKeys: ['Ctrl-k'], enabled: () => enabled, run };
}

describe('resolveKeymap', () => {
  test('finds keymap by id', () => {
    expect(resolveKeymap([ELSEWISE, ECLIPSE], ECLIPSE.id)).toBe(ECLIPSE.keymap);
    expect(resolveKeymap([ELSEWISE, ECLIPSE], ELSEWISE.id)).toBe(ELSEWISE.keymap);
    expect(warn).not.toHaveBeenCalled();
  });

  test('distinguishes plugins with same keymap name', () => {
    const other: LoadedKeymap = {
      id: { source: 'plugin', plugin: 'io.other', name: 'Eclipse' },
      keymap: { name: 'Eclipse', keys: {} },
    };

    expect(resolveKeymap([ECLIPSE, other], other.id)).toBe(other.keymap);
  });

  test('falls back to Elsewise and warns', () => {
    expect(resolveKeymap([ELSEWISE], ECLIPSE.id)).toBe(ELSEWISE.keymap);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('io.example/Eclipse');
  });
});

describe('installApplicationKeys', () => {
  test('runs matching command', () => {
    const run = vi.fn(() => true);
    const { window } = install(command('a', run));
    window.dispatchEvent(press());
    window.dispatchEvent(press({ key: 'j', keyCode: 74 }));

    expect(run).toHaveBeenCalledOnce();
  });

  test('prevents default', () => {
    const { window } = install(command('a', () => true));
    const handled = press();
    const unbound = press({ key: 'j', keyCode: 74 });
    window.dispatchEvent(handled);
    window.dispatchEvent(unbound);

    expect(handled.defaultPrevented).toBe(true);
    expect(unbound.defaultPrevented).toBe(false);
  });

  test('skips handled key', () => {
    const run = vi.fn(() => true);
    const window = new EventTarget() as Window;
    window.addEventListener('keydown', (event) => event.preventDefault());
    const commands = new CommandManager({
      appearance: APPEARANCE,
      editor: new EditorManager(),
      router: memoryRouter(),
      settings: new SettingsPanelManager(),
      terminal: new TerminalManager(),
    });
    commands.add([command('a', run)]);
    installApplicationKeys(window, commands);
    window.dispatchEvent(press());

    expect(run).not.toHaveBeenCalled();
  });

  test('skips composition', () => {
    const run = vi.fn(() => true);
    const { window } = install(command('a', run));
    window.dispatchEvent(press({ isComposing: true }));

    expect(run).not.toHaveBeenCalled();
  });

  test('falls through disabled command', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const { window } = install(command('first', first), command('second', second, false));
    const event = press();
    window.dispatchEvent(event);

    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  test('stops on dispose', () => {
    const run = vi.fn(() => true);
    const { window, dispose } = install(command('a', run));
    dispose();
    window.dispatchEvent(press());

    expect(run).not.toHaveBeenCalled();
  });
});
