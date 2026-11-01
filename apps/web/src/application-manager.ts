import type { Platform } from '@elsewise/components/lib/platform';
import type { Application, Keymap } from '@elsewise/plugin';
import type { AnyRouter } from '@tanstack/react-router';
import type { AppearanceManager } from '@/appearance/appearance-manager';
import { CommandManager } from '@/command/command-manager';
import type { EditorManager } from '@/editor/editor-manager';
import type { SettingsPanelManager } from '@/settings/settings-panel-manager';
import type { TerminalManager } from '@/terminal/terminal-manager';

/**
 * The application, which owns its parts and creates its commands.
 */
export class ApplicationManager implements Application {
  readonly commands: CommandManager;

  constructor(
    readonly appearance: AppearanceManager,
    readonly editor: EditorManager,
    readonly router: AnyRouter,
    readonly settings: SettingsPanelManager,
    readonly terminal: TerminalManager,
    selected: Keymap,
    platform?: Platform,
  ) {
    this.commands = new CommandManager(this, selected, platform);
  }
}
