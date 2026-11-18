import type { TerminalSessionId } from '../terminal';

/**
 * A panel.
 */
export type Panel = EditorPanel | TerminalPanel | FileTreePanel;

/**
 * A panel that can share its group with others.
 */
export type TabPanel = Extract<Panel, { readonly tab: true }>;

/**
 * A panel that is always alone in its group.
 */
export type TablessPanel = Extract<Panel, { readonly tab: false }>;

/**
 * A panel that can be closed.
 */
export type ClosablePanel = Extract<Panel, { readonly closable: true }>;

/**
 * The properties that every panel has.
 */
export interface BasePanel {
  /**
   * The panel's id, which stays the same while the panel is open.
   */
  readonly id: string;

  readonly type: 'editor' | 'terminal' | 'fileTree';

  /**
   * Whether the panel sits among a group's tabs.
   */
  readonly tab: boolean;

  /**
   * Whether the panel can be closed.
   */
  readonly closable: boolean;
}

/**
 * A panel that shows a file in an editor.
 */
export interface EditorPanel extends BasePanel {
  readonly type: 'editor';
  readonly tab: true;
  readonly closable: true;

  /**
   * The file, relative to the workspace's root.
   */
  readonly relativePath: string;
}

/**
 * A panel that shows a terminal.
 */
export interface TerminalPanel extends BasePanel {
  readonly type: 'terminal';
  readonly tab: true;
  readonly closable: true;
  readonly session: TerminalSessionId;
}

/**
 * The panel that shows the file tree.
 */
export interface FileTreePanel extends BasePanel {
  readonly type: 'fileTree';
  readonly tab: false;
  readonly closable: false;
}
