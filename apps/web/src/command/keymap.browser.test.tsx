import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { EditorCommand } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager } from '@/command/command-manager';
import { editorKeymap } from '@/command/keymap';
import { EditorManager } from '@/editor/editor-manager';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { memoryRouter } from '../../test/commands';

const APPEARANCE = new AppearanceManager(
  'dark',
  resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark'),
);

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens an editor with the keys of `added`, which are added in order, above a keymap that binds Ctrl-k to `fallback`.
function open(fallback: () => boolean, ...added: EditorCommand[]): EditorView {
  const commands = new CommandManager({
    appearance: APPEARANCE,
    editor: new EditorManager(),
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
  });
  for (const command of added) {
    commands.add([command]);
  }
  const view = new EditorView({
    state: EditorState.create({
      extensions: [keymap.of([{ key: 'Ctrl-k', run: fallback }]), editorKeymap(commands, commands.keymap.keys.editor)],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Presses Ctrl-k in `view`, or K with `init`'s modifiers.
function press(view: EditorView, init: KeyboardEventInit = { key: 'k', ctrlKey: true }) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyK', keyCode: 75, bubbles: true, cancelable: true, ...init }),
  );
}

describe('editorKeymap', () => {
  test('runs command against view', () => {
    const run = vi.fn<EditorCommand['run']>(() => true);
    const fallback = vi.fn(() => true);
    const view = open(fallback, { id: 'a', label: 'A', scope: 'editor', defaultKeys: ['Ctrl-k'], run });
    press(view);

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.lastCall?.[1]).toBe(view);
    expect(fallback).not.toHaveBeenCalled();
  });

  test('runs later-added command first', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const view = open(
      () => true,
      { id: 'first', label: 'First', scope: 'editor', defaultKeys: ['Ctrl-k'], run: first },
      { id: 'second', label: 'Second', scope: 'editor', defaultKeys: ['Ctrl-k'], run: second },
    );
    press(view);

    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  test('runs uppercase letter held with Shift alone', () => {
    const run = vi.fn(() => true);
    const view = open(() => true, { id: 'a', label: 'A', scope: 'editor', defaultKeys: ['Shift-K'], run });
    press(view, { key: 'K', shiftKey: true });

    expect(run).toHaveBeenCalledOnce();
  });

  test('falls through disabled command', () => {
    const run = vi.fn(() => true);
    const fallback = vi.fn(() => true);
    const view = open(fallback, {
      id: 'a',
      label: 'A',
      scope: 'editor',
      defaultKeys: ['Ctrl-k'],
      enabled: () => false,
      run,
    });
    press(view);

    expect(run).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
  });

  test('falls through command that did not apply', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => false);
    const fallback = vi.fn(() => true);
    const view = open(
      fallback,
      { id: 'first', label: 'First', scope: 'editor', defaultKeys: ['Ctrl-k'], run: first },
      { id: 'second', label: 'Second', scope: 'editor', defaultKeys: ['Ctrl-k'], run: second },
    );
    press(view);

    expect(second).toHaveBeenCalledBefore(first);
    expect(first).toHaveBeenCalledBefore(fallback);
  });
});
