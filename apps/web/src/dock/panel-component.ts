import type { ClosablePanel, Panel } from '@elsewise/frontend-plugin';
import type { IDockviewPanelHeaderProps, IDockviewPanelProps } from 'dockview-react';
import type { FunctionComponent } from 'react';
import type { ApplicationManager } from '@/application-manager';
import { closeFile } from '@/fs/close-file';
import { FilePanel } from '@/routes/_shell/$daemon/$project/$workspace/-file/file-panel';
import { FileTab } from '@/routes/_shell/$daemon/$project/$workspace/-file/file-tab';
import { FileTreePanel } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/file-tree-panel';
import { Placeholder, PlaceholderTab } from '@/routes/_shell/$daemon/$project/$workspace/-placeholder/placeholder';
import { TerminalPanel } from '@/routes/_shell/$daemon/$project/$workspace/-terminal/terminal-panel';
import { TerminalTab } from '@/routes/_shell/$daemon/$project/$workspace/-terminal/terminal-tab';
import { FileTreeTab } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { closeTerminal } from '@/terminals/close-terminal';
import type { DockManager } from './dock-manager';

export const DEFAULT_PANEL_COMPONENTS: readonly PanelComponent[] = [
  { type: 'placeholder', tab: PlaceholderTab, panel: Placeholder },
  { type: 'file', tab: FileTab, panel: FilePanel, close: closeFile },
  { type: 'terminal', tab: TerminalTab, panel: TerminalPanel, close: closeTerminal },
  { type: 'fileTree', tab: FileTreeTab, panel: FileTreePanel },
];

export interface PanelComponent {
  readonly type: Panel['type'];
  readonly tab: FunctionComponent<IDockviewPanelHeaderProps>;
  readonly panel: FunctionComponent<IDockviewPanelProps>;

  close?(application: ApplicationManager, dock: DockManager, panel: ClosablePanel): boolean | Promise<boolean>;
}
