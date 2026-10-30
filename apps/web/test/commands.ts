import type { Extension } from '@codemirror/state';
import type { Platform } from '@elsewise/components/lib/platform';
import type { Keymap } from '@elsewise/plugin';
import type { AnyRouter } from '@tanstack/react-router';
import { createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { ApplicationManager } from '@/application-manager';
import type { CommandManager } from '@/command/command-manager';
import { editorKeymap } from '@/command/keymap/keymap';
import { COMMANDS, EditorManager } from '@/editor/editor-manager';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';

// A keymap without entries, so every command keeps its default keys.
export const EMPTY_KEYMAP: Keymap = { name: 'Empty', keys: {} };

// An application with the built-in commands and an empty keymap, from `parts` and fresh managers for the rest.
export function builtInApplication(
  parts: Partial<Pick<ApplicationManager, 'appearance' | 'editor' | 'settings' | 'terminal'>> = {},
  platform?: Platform,
): ApplicationManager {
  return new ApplicationManager(
    parts.appearance ??
      new AppearanceManager('light', resolveActiveTheme([], { source: 'elsewise', id: 'elsewise' }, 'light')),
    parts.editor ?? new EditorManager(),
    memoryRouter(),
    parts.settings ?? new SettingsPanelManager(),
    parts.terminal ?? new TerminalManager(),
    EMPTY_KEYMAP,
    platform,
  );
}

export function builtInCommands(parts: Parameters<typeof builtInApplication>[0] = {}): CommandManager {
  return builtInApplication(parts).commands;
}

// A router with no pages, on a history of its own.
export function memoryRouter(): AnyRouter {
  return createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
}

export function commandsExtension(commands = builtInCommands()): Extension {
  return [editorKeymap(commands, commands.keymap.keys.editor), COMMANDS.of(commands)];
}
