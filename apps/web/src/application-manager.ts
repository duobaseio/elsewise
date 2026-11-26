import type { Platform } from '@elsewise/components/lib/platform';
import type { Application, Keymap } from '@elsewise/frontend-plugin';
import type { AnyRouter } from '@tanstack/react-router';
import type { AppearanceManager } from '@/appearance/appearance-manager';
import { CommandManager } from '@/command/command-manager';
import { DocksManager } from '@/dock/docks-manager';
import type { EditorManager } from '@/editor/editor-manager';
import { FileHandleStore } from '@/fs/file-handle-store';
import type { FileTreeManager } from '@/fs/file-tree-manager';
import { PlatformManager } from '@/platform-manager';
import type { ProjectManager } from '@/projects/project-manager';
import { SidebarStore } from '@/projects/sidebar-store';
import type { SettingsPanelManager } from '@/settings/settings-panel-manager';
import type { TerminalManager } from '@/terminals/terminal-manager';

/**
 * The application, which owns its parts and creates its commands.
 */
export class ApplicationManager implements Application {
  readonly platform = new PlatformManager();
  readonly commands: CommandManager;
  readonly sidebar = new SidebarStore();
  readonly files = new FileHandleStore();
  readonly docks: DocksManager;

  constructor(
    readonly appearance: AppearanceManager,
    readonly router: AnyRouter,
    readonly settings: SettingsPanelManager,
    readonly projects: ProjectManager,
    readonly editor: EditorManager,
    readonly terminals: TerminalManager,
    readonly fileTree: FileTreeManager,
    selected: Keymap,
    platform?: Platform,
  ) {
    this.docks = new DocksManager(this);
    this.commands = new CommandManager(this, selected, platform);
  }
}
