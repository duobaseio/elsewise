'use client';

import {
  type FileTreeDropContext,
  type FileTreeDropResult,
  type FileTreeRenameEvent,
  type FileTreeRenamingItem,
  type GitStatusEntry,
  FileTree as PierreFileTreeModel,
} from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree as usePierreFileTree } from '@pierre/trees/react';
import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '../../lib/utils';
import { iconUrl, useIcons } from '../icon';
import themeCss from './file-tree.css?inline';
import { useFileTreeIcons } from './icons';
import unsafeCss from './unsafe.css?inline';

export type { FileTreeDropContext, FileTreeDropResult } from '@pierre/trees';

const UNSAFE_CSS = `${themeCss}\n${unsafeCss}`;

export interface FileTreeProps {
  model: FileTreeModel;
  className?: string;
  /**
   * The paths that are cut.
   */
  cutPaths?: readonly string[];
  gitStatusBadges?: boolean;
  indentGuides?: boolean;
  /**
   * The folder a drag targets, ending with `/`, or `''` for the root.
   */
  dropTarget?: string;
  'aria-label'?: string;
}

export function FileTree({
  model,
  className,
  cutPaths,
  gitStatusBadges = true,
  indentGuides = true,
  dropTarget,
  'aria-label': ariaLabel,
}: FileTreeProps) {
  const icons = useIcons();
  const flat = useSyncExternalStore(
    (listener) => model.subscribe(listener),
    () => model.getVisibleRows(0, 0)[0]?.kind !== 'directory',
  );

  const wrapper = useRef<HTMLDivElement>(null);
  const dragged = useRef<readonly string[] | null>(null);
  const [rootTarget, setRootTarget] = useState(false);
  useEffect(() => {
    const shadowRoot = wrapper.current?.firstElementChild?.shadowRoot;
    if (shadowRoot == null || cutPaths === undefined || cutPaths.length === 0) {
      return undefined;
    }

    // TODO: Mark cut rows through the tree once it can style a row by its path.
    // Unlayered, so it wins over the library's layered git status colour.
    const cut = document.createElement('style');
    cut.textContent = `${cutPaths
      .map((path) => `[data-item-path="${CSS.escape(path)}"] > [data-item-section="content"]`)
      .join(',\n')} { color: var(--disabled); }`;
    shadowRoot.append(cut);
    return () => cut.remove();
  }, [cutPaths]);

  useEffect(() => {
    const shadowRoot = wrapper.current?.firstElementChild?.shadowRoot;
    if (shadowRoot == null || dropTarget === undefined || dropTarget === '') {
      return undefined;
    }

    // TODO: Mark the drop target through the tree once it shows one for drags it did not start.
    const target = document.createElement('style');
    target.textContent = `[data-item-path="${CSS.escape(dropTarget)}"] { background-color: var(--trees-selected-bg); }`;
    shadowRoot.append(target);
    return () => target.remove();
  }, [dropTarget]);

  const style = {
    '--ew-folder-icon': `url("${iconUrl(icons.folder)}")`,
    '--ew-folder-open-icon': `url("${iconUrl(icons['folder-open'])}")`,
  } as CSSProperties;

  // The tree only treats rows as drop targets, so the wrapper takes drops onto the empty space below them.
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the drag handlers only extend the tree's own drop targets.
    <div
      ref={wrapper}
      className="contents"
      onDragStart={(event) => {
        const paths = model.getSelectedPaths();
        dragged.current = event.nativeEvent.defaultPrevented
          ? null
          : paths.filter(
              (path) => !paths.some((other) => other !== path && other.endsWith('/') && path.startsWith(other)),
            );
      }}
      onDragOver={(event) => {
        const root = dragged.current !== null && !overRow(event.nativeEvent);
        setRootTarget(root);
        if (root) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDragEnd={() => {
        dragged.current = null;
        setRootTarget(false);
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
          setRootTarget(false);
        }
      }}
      onDrop={(event) => {
        if (dragged.current !== null && !overRow(event.nativeEvent)) {
          event.preventDefault();
          model.dropIntoRoot(dragged.current);
        }
        dragged.current = null;
        setRootTarget(false);
      }}
    >
      <PierreFileTree
        aria-label={ariaLabel}
        model={model}
        className={cn('h-full scheme-light dark:scheme-dark', className)}
        style={style}
        data-git-status-badges={gitStatusBadges}
        data-indent-guides={indentGuides}
        data-drop-target={dropTarget === '' || rootTarget || undefined}
        data-flat={flat || undefined}
      />
    </div>
  );
}

/**
 * Options for {@link useFileTree}.
 *
 * The `initial*` fields are only read on mount; change the tree afterward through the model. Callbacks can change
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
  onRename?: (event: FileTreeRenameEvent, model: FileTreeModel) => void;
  /** Called with a message when the tree rejects the new name. The row keeps its old name. */
  onRenameError?: (error: string, model: FileTreeModel) => void;

  /** Return false to stop these paths from being dragged. Defaults to allowing every drag. */
  canDrag?: (paths: readonly string[]) => boolean;
  /** Return false to reject a drop on this target. Defaults to allowing every drop. */
  canDrop?: (context: FileTreeDropContext) => boolean;
  /** Called after a drop has moved the rows in the tree. */
  onDropComplete?: (event: FileTreeDropResult, model: FileTreeModel) => void;
  /** Called with a message when the tree could not apply a drop. Nothing is moved. */
  onDropError?: (error: string, context: FileTreeDropContext, model: FileTreeModel) => void;
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
  setGitStatus(statuses?: readonly FileTreeGitStatus[]): void;
  setGitStatus(statuses?: readonly GitStatusEntry[]): void;

  /**
   * Calls `listener` when a folder opens or closes.
   *
   * To stop watching, call the returned function.
   */
  onExpansion(listener: (path: string, expanded: boolean) => void): () => void;

  /**
   * Moves `paths` into the root, as dropping them onto the empty space below the rows does.
   */
  dropIntoRoot(paths: readonly string[]): void;
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
    gitStatus: options.initialGitStatus && mapGitStatus(options.initialGitStatus),
    icons,
    onSelectionChange: (selectedPaths) => latest.current.onSelectionChange?.(selectedPaths),
    renaming: {
      canRename: (item) => latest.current.canRename?.(item) ?? true,
      onRename: (event) => latest.current.onRename?.(event, tree),
      onError: (error) => latest.current.onRenameError?.(error, tree),
    },
    dragAndDrop: {
      canDrag: (paths) => latest.current.canDrag?.(paths) ?? true,
      canDrop: (context) => latest.current.canDrop?.(context) ?? true,
      onDropComplete: (event) => latest.current.onDropComplete?.(event, tree),
      onDropError: (error, context) => latest.current.onDropError?.(error, context, tree),
      openOnDropDelay: 0,
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

  const tree: FileTreeModel = Object.assign(model, {
    setGitStatus(statuses?: readonly (FileTreeGitStatus | GitStatusEntry)[]) {
      PierreFileTreeModel.prototype.setGitStatus.call(model, statuses && mapGitStatus(statuses));
    },
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
    dropIntoRoot(paths: readonly string[]) {
      const context: FileTreeDropContext = {
        draggedPaths: paths,
        target: { directoryPath: null, flattenedSegmentPath: null, hoveredPath: null, kind: 'root' },
      };
      if (latest.current.canDrop?.(context) === false) {
        return;
      }

      const moves = paths
        .map((path) => ({ from: path, to: path.slice(path.slice(0, -1).lastIndexOf('/') + 1) }))
        .filter(({ from, to }) => from !== to);
      if (moves.length === 0) {
        return;
      }

      const existing = moves.find(({ to }) => model.getItem(to) !== null);
      if (existing !== undefined) {
        latest.current.onDropError?.(`“${existing.to.replace(/\/$/, '')}” already exists.`, context, tree);
        return;
      }

      for (const { from, to } of moves) {
        model.move(from, to);
      }
      latest.current.onDropComplete?.({ ...context, operation: moves.length > 1 ? 'batch' : 'move' }, tree);
    },
  });

  return tree;
}

function overRow(event: Event): boolean {
  return event.composedPath().some((node) => node instanceof HTMLElement && node.dataset.itemPath !== undefined);
}

function mapGitStatus(statuses: readonly (FileTreeGitStatus | GitStatusEntry)[]): GitStatusEntry[] {
  return statuses.map((entry) => ({
    path: entry.path,
    status: entry.status === 'conflict' ? ('deleted' as const) : entry.status,
  }));
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
