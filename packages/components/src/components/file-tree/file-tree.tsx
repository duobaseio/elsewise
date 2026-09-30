import type {
  FileTreeDropContext,
  FileTreeDropResult,
  FileTreeRenameEvent,
  FileTreeRenamingItem,
  FileTree as PierreFileTreeModel,
} from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree as usePierreFileTree } from '@pierre/trees/react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { useIcons } from '../icon';
import themeCss from './file-tree.css?inline';
import { iconUrl, useFileTreeIcons } from './icons';
import unsafeCss from './unsafe.css?inline';

const UNSAFE_CSS = `${themeCss}\n${unsafeCss}`;

export interface FileTreeProps {
  model: FileTreeModel;
  className?: string;
  gitStatusBadges?: boolean;
  'aria-label'?: string;
}

export function FileTree({ model, className, gitStatusBadges = true, 'aria-label': ariaLabel }: FileTreeProps) {
  const icons = useIcons();
  const style = {
    '--ew-folder-icon': `url("${iconUrl(icons.folder)}")`,
    '--ew-folder-open-icon': `url("${iconUrl(icons['folder-open'])}")`,
  } as CSSProperties;

  return (
    <PierreFileTree
      aria-label={ariaLabel}
      model={model}
      className={cn('h-full scheme-light dark:scheme-dark', className)}
      style={style}
      data-git-status-badges={gitStatusBadges}
    />
  );
}

/**
 * Options for {@link useFileTree}.
 *
 * The `initial*` fields are only read on mount; change the tree afterwards through the model. Callbacks can change
 * between renders.
 */
export interface FileTreeOptions {
  /** Every path in the tree. Folders end with `/`. */
  initialPaths: readonly string[];
  /** Folders that start open. */
  initialExpandedPaths?: readonly string[];
  /** Paths that start selected. */
  initialSelectedPaths?: readonly string[];
  /** Paths' git statuses. */
  initialGitStatus?: readonly FileTreeGitStatus[];

  /** Called with every selected path whenever the selection changes. */
  onSelectionChange?: (selectedPaths: readonly string[]) => void;

  /** Return false to stop an item from being renamed. Defaults to allowing every item. */
  canRename?: (item: FileTreeRenamingItem) => boolean;
  /** Called when an inline rename is committed with a new name, just before the tree moves the row. */
  onRename?: (event: FileTreeRenameEvent) => void;
  /** Called with a message when the tree rejects the new name. The row keeps its old name. */
  onRenameError?: (error: string) => void;

  /** Return false to stop these paths from being dragged. Defaults to allowing every drag. */
  canDrag?: (paths: readonly string[]) => boolean;
  /** Return false to reject a drop on this target. Defaults to allowing every drop. */
  canDrop?: (context: FileTreeDropContext) => boolean;
  /** Called after a drop has moved the rows in the tree. */
  onDropComplete?: (event: FileTreeDropResult) => void;
  /** Called with a message when the tree could not apply a drop. Nothing is moved. */
  onDropError?: (error: string, context: FileTreeDropContext) => void;
}

/** The git status of a file/folder. */
export interface FileTreeGitStatus {
  /** A path. Folders end with `/`. */
  path: string;
  /**
   * The git status:
   *  * modified - blue, "M"
   *  * added - green, "A"
   *  * untracked - red, "U"
   *  * ignored - grey, no letterIs
   *  * conflict - amber, "!"
   */
  status: 'modified' | 'added' | 'untracked' | 'ignored' | 'conflict';
}

/** The file tree's model, which is used to read and mutate the tree after mount. */
export interface FileTreeModel extends PierreFileTreeModel {
  /**
   * Calls `listener` when a folder opens or closes.
   *
   * To stop watching, call the returned function.
   */
  onExpansion(listener: (path: string, expanded: boolean) => void): () => void;
}

/** Creates the file tree's model. */
export function useFileTree(options: FileTreeOptions): FileTreeModel {
  const latest = useRef(options);
  latest.current = options;

  const icons = useFileTreeIcons();

  const [paths] = useState(() => [...options.initialPaths]);
  const { model } = usePierreFileTree({
    paths,
    flattenEmptyDirectories: false,
    initialExpansion: 'closed',
    initialExpandedPaths: options.initialExpandedPaths,
    initialSelectedPaths: options.initialSelectedPaths,
    density: 'compact',
    gitStatus: options.initialGitStatus?.map((entry) => ({
      path: entry.path,
      status: entry.status === 'conflict' ? 'deleted' : entry.status,
    })),
    icons,
    onSelectionChange: (selectedPaths) => latest.current.onSelectionChange?.(selectedPaths),
    renaming: {
      canRename: (item) => latest.current.canRename?.(item) ?? true,
      onRename: (event) => latest.current.onRename?.(event),
      onError: (error) => latest.current.onRenameError?.(error),
    },
    dragAndDrop: {
      canDrag: (paths) => latest.current.canDrag?.(paths) ?? true,
      canDrop: (context) => latest.current.canDrop?.(context) ?? true,
      onDropComplete: (event) => latest.current.onDropComplete?.(event),
      onDropError: (error, context) => latest.current.onDropError?.(error, context),
    },
    unsafeCSS: UNSAFE_CSS,
  });

  // The model reads `icons` once, at construction; a provider's later icons have to be pushed.
  const applied = useRef(icons);
  useEffect(() => {
    if (applied.current !== icons) {
      applied.current = icons;
      model.setIcons(icons);
    }
  }, [model, icons]);

  return Object.assign(model, {
    onExpansion(listener: (path: string, expanded: boolean) => void) {
      let open = openFolders(model, new Set());

      return model.subscribe(() => {
        const next = openFolders(model, open);
        for (const path of open) {
          if (!next.has(path)) {
            listener(path, false);
          }
        }
        for (const path of next) {
          if (!open.has(path)) {
            listener(path, true);
          }
        }
        open = next;
      });
    },
  });
}

function openFolders(model: PierreFileTreeModel, previous: ReadonlySet<string>): Set<string> {
  const open = new Set<string>();

  // We need to remember the open child folders as closing a parent folder does not close child folders.
  for (const path of previous) {
    const item = model.getItem(path);
    if (item != null && 'isExpanded' in item && item.isExpanded()) {
      open.add(path);
    }
  }

  for (const row of model.getVisibleRows(0, model.getVisibleCount())) {
    if (row.kind === 'directory' && row.isExpanded) {
      open.add(row.path);
    }
  }
  return open;
}
