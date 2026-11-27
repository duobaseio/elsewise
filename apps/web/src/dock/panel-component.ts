import type { Panel } from '@elsewise/frontend-plugin';
import type { IDockviewPanelHeaderProps, IDockviewPanelProps } from 'dockview-react';
import type { FunctionComponent, ReactNode } from 'react';
import type { ApplicationManager } from '@/application-manager';
import { closeFile } from '@/fs/close-file';
import {
  CustomHeader,
  CustomPanelContent,
  customTooltip,
} from '@/routes/_shell/$daemon/$project/$workspace/-custom/custom-panel';
import { FileHeader, fileTooltip } from '@/routes/_shell/$daemon/$project/$workspace/-file/file-header';
import { FilePanel } from '@/routes/_shell/$daemon/$project/$workspace/-file/file-panel';
import { FileTreeHeader } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/file-tree-header';
import { FileTreePanel } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/file-tree-panel';
import { Placeholder, PlaceholderHeader } from '@/routes/_shell/$daemon/$project/$workspace/-placeholder/placeholder';
import { TerminalHeader, terminalTooltip } from '@/routes/_shell/$daemon/$project/$workspace/-terminal/terminal-header';
import { TerminalPanel } from '@/routes/_shell/$daemon/$project/$workspace/-terminal/terminal-panel';
import { closeTerminal } from '@/terminals/close-terminal';
import type { DockManager } from './dock-manager';

export const DEFAULT_PANEL_COMPONENTS: readonly PanelComponent[] = [
  { type: 'placeholder', header: PlaceholderHeader, panel: Placeholder },
  { type: 'file', header: FileHeader, tooltip: fileTooltip, panel: FilePanel, close: closeFile },
  {
    type: 'terminal',
    header: TerminalHeader,
    tooltip: terminalTooltip,
    panel: TerminalPanel,
    close: closeTerminal,
  },
  { type: 'fileTree', header: FileTreeHeader, panel: FileTreePanel },
  { type: 'custom', header: CustomHeader, tooltip: customTooltip, panel: CustomPanelContent },
];

export interface PanelComponent {
  readonly type: Panel['type'] | 'custom';
  readonly header: FunctionComponent<Pick<IDockviewPanelHeaderProps, 'api' | 'params'>>;
  readonly panel: FunctionComponent<IDockviewPanelProps>;

  tooltip?(application: ApplicationManager, dock: DockManager, panel: Panel): ReactNode | null;

  close?(application: ApplicationManager, dock: DockManager, panel: Panel): boolean | Promise<boolean>;
}
