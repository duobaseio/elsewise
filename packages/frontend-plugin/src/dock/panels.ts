import type { TerminalSessionId } from '../terminal';

/**
 * A panel.
 */
export type Panel = PlaceholderPanel | FilePanel | TerminalPanel | FileTreePanel | CustomPanel;

/**
 * The properties that every panel has.
 */
export interface BasePanel {
  /**
   * The panel's id, which stays the same while the panel is open.
   */
  readonly id: string;

  readonly type: 'placeholder' | 'file' | 'terminal' | 'fileTree' | CustomPanel['type'];

  /**
   * Whether the panel sits among a group's tabs. A panel that does not is always alone in its group.
   */
  readonly tab: boolean;

  /**
   * Whether the panel can be closed.
   */
  readonly closable: boolean;
}

/**
 * The panel that a dock has while no other tab panel is open.
 */
export interface PlaceholderPanel extends BasePanel {
  readonly type: 'placeholder';
  readonly tab: true;
  readonly closable: false;
}

/**
 * A panel that shows a file.
 */
export interface FilePanel extends BasePanel {
  readonly type: 'file';
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
  readonly closeConfirmation: boolean;
}

/**
 * The panel that shows the file tree.
 */
export interface FileTreePanel extends BasePanel {
  readonly type: 'fileTree';
  readonly tab: false;
  readonly closable: false;
}

/**
 * A panel that shows a custom component.
 */
export interface CustomPanel extends BasePanel {
  readonly type: `${string}/${string}`;
}
