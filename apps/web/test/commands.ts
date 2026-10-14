import type { Extension } from '@codemirror/state';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager } from '@/command/command-manager';
import { editorKeymap } from '@/command/keymap';
import { COMMANDS } from '@/editor/editor';
import { EditorManager } from '@/editor/editor-manager';

export function builtInCommands(editor = new EditorManager()): CommandManager {
  return new CommandManager({
    appearance: new AppearanceManager(
      'light',
      resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light'),
    ),
    editor,
  });
}

export function commandsExtension(commands = builtInCommands()): Extension {
  return [editorKeymap(commands, commands.keymap.keys.editor), COMMANDS.of(commands)];
}
