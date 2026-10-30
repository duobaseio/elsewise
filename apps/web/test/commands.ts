import type { Extension } from '@codemirror/state';
import type { Keymap } from '@elsewise/plugin';
import type { AnyRouter } from '@tanstack/react-router';
import { createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager } from '@/command/command-manager';
import { editorKeymap } from '@/command/keymap/keymap';
import { COMMANDS, EditorManager } from '@/editor/editor-manager';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';

// A keymap without entries, so every command keeps its default keys.
export const EMPTY_KEYMAP: Keymap = { name: 'Empty', keys: {} };

export function builtInCommands(editor = new EditorManager(), terminal = new TerminalManager()): CommandManager {
  return new CommandManager(
    {
      appearance: new AppearanceManager(
        'light',
        resolveActiveTheme([], { source: 'elsewise', id: 'elsewise' }, 'light'),
      ),
      editor,
      router: memoryRouter(),
      settings: new SettingsPanelManager(),
      terminal,
    },
    EMPTY_KEYMAP,
  );
}

// A router with no pages, on a history of its own.
export function memoryRouter(): AnyRouter {
  return createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
}

export function commandsExtension(commands = builtInCommands()): Extension {
  return [editorKeymap(commands, commands.keymap.keys.editor), COMMANDS.of(commands)];
}
