import { DEFAULT_WORKSPACE_STATE } from '@elsewise/bridge';
import { FileTree, type FileTreeModel, useFileTree } from '@elsewise/components/components/file-tree';
import { toast } from '@elsewise/components/components/toast';
import type { FileTreeSelection, Workspace, WorkspaceId } from '@elsewise/frontend-plugin';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useRef, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { useCommandManager } from '@/command/command-manager';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { runFileTreeKeys } from '@/command/keymap/keymap';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import { DirectoryWatcher } from '@/fs/directory-watcher';
import { useFileTreeManager } from '@/fs/file-tree-manager';
import { type PasteEntry, pasteEntries } from '@/fs/paste';
import { watchGitStatus } from '@/git/status';
import { sameWorkspace, useWorkspace } from '@/projects/workspace-manager';
import { useWorkspaceStateStore } from '@/projects/workspace-state-store';
import { useSettings } from '@/settings/settings';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

// How close to the tree's top or bottom edge an outside drag scrolls it, and how far per frame at most, as the tree
// does for its own drags.
const EDGE_SCROLL_THRESHOLD = 40;
const EDGE_SCROLL_SPEED = 18;

export function FileTreePanel(_props: IDockviewPanelProps<{ path: string }>) {
  const { daemon, project, workspace: workspaceId } = route.useParams();
  const client = useQuery(daemonQuery(daemon)).data;
  const gitStatusBadges = useSettings((settings) => settings.fileTree.gitStatusBadges);
  const indentGuides = useSettings((settings) => settings.fileTree.indentGuides);
  const workspace = useWorkspace({ daemon, project, workspace: workspaceId });

  const commands = useCommandManager();
  const { fileTree } = useApplicationManager();
  const menu = useFileTreeManager((manager) => manager.contextMenu);
  const clipboard = useFileTreeManager((manager) => manager.clipboard);
  const cutPaths =
    clipboard?.cut && sameWorkspace(clipboard.workspace, { daemon, project, workspace: workspaceId })
      ? clipboard.paths
      : undefined;
  const clicked = useRef<string | null>(null);
  const target = useRef<FileTreeSelection | null>(null);

  const model = useWorkspaceTree({ daemon, project, workspace: workspaceId }, client, workspace);
  const dropFromPlatform = usePlatformDrop(model, client, workspace);
  const edgeScroll = useEdgeScroll(model);
  const [dropTarget, setDropTarget] = useState<string>();

  const renaming = useFileTreeManager((manager) => manager.renaming);
  useEffect(() => {
    if (renaming !== null && sameWorkspace(renaming.workspace, { daemon, project, workspace: workspaceId })) {
      fileTree.renaming = null;
      model.startRenaming(renaming.path);
    }
  }, [renaming, fileTree, model, daemon, project, workspaceId]);

  return (
    <CommandContextMenu
      menu={menu}
      target={target}
      opens={(event) => {
        const path = rowPath(event);
        if (workspace === undefined) {
          return false;
        }

        const selected = model.getSelectedPaths();
        const paths = path === undefined ? [] : selected.includes(path) ? selected : [path];
        if (paths !== selected) {
          for (const other of selected) {
            model.getItem(other)?.deselect();
          }
          if (path !== undefined) {
            model.getItem(path)?.select();
          }
        }
        clicked.current = path ?? null;
        target.current = { workspace, paths: [...paths] };
        return true;
      }}
      onClosed={() => {
        if (clicked.current !== null) {
          model.focusPath(clicked.current);
        }
        model.getFileTreeContainer()?.shadowRoot?.querySelector<HTMLElement>('[role="tree"]')?.focus();
      }}
      render={
        // The tree ignores drags it did not start, so files dropped from outside are handled here.
        // biome-ignore lint/a11y/noStaticElementInteractions: the keys run commands on the tree's selection inside.
        <div
          onKeyDown={(event) => {
            if (workspace !== undefined) {
              runFileTreeKeys(commands, { workspace, paths: [...model.getSelectedPaths()] }, event.nativeEvent);
            }
          }}
          onDragOver={(event) => {
            if (dropFromPlatform === undefined || !event.dataTransfer.types.includes('Files')) {
              setDropTarget(undefined);
              return;
            }

            const path = rowPath(event.nativeEvent);
            const folder = path?.slice(0, path.lastIndexOf('/') + 1) ?? '';
            event.preventDefault();
            // Wayland is a fucking special snowflake. event.altKey is always false because the modifier key is reported
            // to the compositer which Chromium doesn't expose to us.
            event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
            setDropTarget(folder);

            edgeScroll.scrollAt(event.clientY);
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
              setDropTarget(undefined);
              edgeScroll.stop();
            }
          }}
          onDrop={(event) => {
            if (dropFromPlatform !== undefined && event.dataTransfer.types.includes('Files')) {
              const path = rowPath(event.nativeEvent);
              event.preventDefault();
              dropFromPlatform(event.dataTransfer, path?.slice(0, path.lastIndexOf('/') + 1) ?? '', !event.altKey);
            }
            setDropTarget(undefined);
            edgeScroll.stop();
          }}
        />
      }
      className="h-full"
    >
      <FileTree
        model={model}
        cutPaths={cutPaths}
        gitStatusBadges={gitStatusBadges}
        indentGuides={indentGuides}
        dropTarget={dropTarget}
        aria-label="Files"
      />
    </CommandContextMenu>
  );
}

function useWorkspaceTree(
  { daemon, project, workspace: name }: WorkspaceId,
  client: Daemon | undefined,
  workspace: Workspace | undefined,
): FileTreeModel {
  const { fileTree } = useApplicationManager();
  const store = useWorkspaceStateStore();
  const hidden = useSettings((settings) => settings.fileTree.hidden);
  const root = workspace?.absolutePath;

  const move = (model: FileTreeModel, paths: readonly string[], folder: string, moved: boolean) => {
    if (client === undefined || workspace === undefined) {
      return;
    }

    const entries = paths
      .map((path) => {
        const source = path.replace(/\/$/, '');
        const destination = `${folder}${source.slice(source.lastIndexOf('/') + 1)}`;
        return { source, destination, folder: path.endsWith('/') };
      })
      .filter((entry) => entry.source !== entry.destination);
    if (entries.length === 0) {
      return;
    }

    const updated = moved ? entries : [];
    if (!moved) {
      for (const entry of entries) {
        const suffix = entry.folder ? '/' : '';
        try {
          model.move(entry.source + suffix, entry.destination + suffix);
          updated.push(entry);
        } catch {}
      }
    }

    const restore = (failed: readonly PasteEntry[]) => {
      for (const entry of updated.filter((other) => failed.includes(other))) {
        const suffix = entry.folder ? '/' : '';
        model.move(entry.destination + suffix, entry.source + suffix);
      }
    };

    pasteEntries(client, workspace, true, entries, false).then(
      ({ conflicting, failures }) => {
        restore([...conflicting, ...failures.map((failure) => failure.entry)]);
        for (const entry of entries) {
          if (!conflicting.includes(entry) && !failures.some((failure) => failure.entry === entry)) {
            const suffix = entry.folder ? '/' : '';
            fileTree.moveClipboardPaths(workspace.id, entry.source + suffix, entry.destination + suffix);
          }
        }

        for (const { entry, error } of failures) {
          toast.add({
            type: 'error',
            title: `Moving “${entry.source.slice(entry.source.lastIndexOf('/') + 1)}” failed`,
            description: error.message,
          });
        }

        if (conflicting.length > 0) {
          fileTree.overwriteDialog.openWithPayload({
            workspace,
            folder: folder === '' ? workspace.name : folder.replace(/\/$/, ''),
            cut: true,
            entries: conflicting,
          });
        }
      },
      (error: Error) => {
        restore(entries);
        toast.add({ type: 'error', title: 'Moving failed', description: error.message });
      },
    );
  };

  const model = useFileTree({
    initialPaths: [],
    canRename: () => true,
    onRename: ({ sourcePath, destinationPath }, model) => {
      if (client === undefined || workspace === undefined) {
        return;
      }

      const entry = {
        source: sourcePath.replace(/\/$/, ''),
        destination: destinationPath.replace(/\/$/, ''),
        folder: sourcePath.endsWith('/'),
      };
      const restore = (description: string) => {
        model.move(destinationPath, sourcePath);
        toast.add({ type: 'error', title: 'Renaming failed', description });
      };
      pasteEntries(client, workspace, true, [entry], false).then(
        ({ conflicting, failures: [failure] }) => {
          if (conflicting.length > 0) {
            restore(`“${entry.destination.split('/').at(-1)}” already exists.`);
          } else if (failure !== undefined) {
            restore(failure.error.message);
          } else {
            fileTree.moveClipboardPaths(workspace.id, sourcePath, destinationPath);
          }
        },
        (error: Error) => restore(error.message),
      );
    },
    onRenameError: (error) => toast.add({ type: 'error', title: 'Renaming failed', description: error }),
    onDropComplete: ({ draggedPaths, target }, model) => move(model, draggedPaths, target.directoryPath ?? '', true),
    onDropError: (_, { draggedPaths, target }, model) => move(model, draggedPaths, target.directoryPath ?? '', false),
  });

  useEffect(() => {
    if (client === undefined || root === undefined) {
      return undefined;
    }

    const id = { daemon, project, workspace: name };
    const watcher = new DirectoryWatcher(
      root,
      model,
      client.fileSystem.watchDirectories(),
      store.get(id)?.fileTree ?? DEFAULT_WORKSPACE_STATE.fileTree,
      hidden,
    );
    const unsubscribeGitStatus = watchGitStatus(client.git, root, model);
    const unsubscribeFileSystem = model.subscribe(() => store.update(id, { fileTree: watcher.snapshot() }));

    return () => {
      watcher.dispose();
      unsubscribeGitStatus();
      unsubscribeFileSystem();
    };
  }, [client, root, model, store, daemon, project, name, hidden]);

  return model;
}

// TODO: Upload the contents to other daemons once remotes exist.
function usePlatformDrop(model: FileTreeModel, client: Daemon | undefined, workspace: Workspace | undefined) {
  const { fileTree } = useApplicationManager();
  const absolutePathOf = workspace?.id.daemon === LOCAL_DAEMON_ID ? window.bridge?.window?.absolutePathOf : undefined;
  if (client === undefined || workspace === undefined || absolutePathOf === undefined) {
    return undefined;
  }

  return (transfer: DataTransfer, folder: string, cut: boolean) => {
    const entries = [...transfer.items]
      .flatMap((item) => {
        const file = item.getAsFile();
        const source = file === null ? '' : absolutePathOf(file);
        return file === null || source === ''
          ? []
          : [
              {
                source,
                destination: `${folder}${file.name}`,
                folder: item.webkitGetAsEntry()?.isDirectory ?? false,
                absolute: true,
              },
            ];
      })
      .filter((entry) => entry.source !== `${workspace.absolutePath}/${entry.destination}`);
    if (entries.length === 0) {
      return;
    }

    pasteEntries(client, workspace, cut, entries, false).then(
      ({ conflicting, failures }) => {
        const paths = entries
          .filter((entry) => !conflicting.includes(entry) && !failures.some((failure) => failure.entry === entry))
          .map((entry) => entry.destination + (entry.folder ? '/' : ''));
        const [first] = paths;
        if (first !== undefined) {
          for (const path of model.getSelectedPaths()) {
            model.getItem(path)?.deselect();
          }
          for (const path of paths) {
            if (model.getItem(path) === null) {
              model.add(path);
            }
            model.getItem(path)?.select();
          }
          model.focusPath(first);
        }

        for (const { entry, error } of failures) {
          toast.add({
            type: 'error',
            title: `${cut ? 'Moving' : 'Copying'} “${entry.destination.slice(entry.destination.lastIndexOf('/') + 1)}” failed`,
            description: error.message,
          });
        }

        if (conflicting.length > 0) {
          fileTree.overwriteDialog.openWithPayload({
            workspace,
            folder: folder === '' ? workspace.name : folder.replace(/\/$/, ''),
            cut,
            entries: conflicting,
          });
        }
      },
      (error: Error) =>
        toast.add({ type: 'error', title: cut ? 'Moving failed' : 'Copying failed', description: error.message }),
    );
  };
}

function useEdgeScroll(model: FileTreeModel) {
  const scrolling = useRef<{ y: number; frame: number } | null>(null);

  return {
    scrollAt(y: number) {
      if (scrolling.current !== null) {
        scrolling.current.y = y;
        return;
      }

      const step = () => {
        // TODO: Let the tree scroll once it auto-scrolls drags it did not start.
        const scroller = model.getFileTreeContainer()?.shadowRoot?.querySelector('[data-file-tree-virtualized-scroll]');
        if (scrolling.current === null || scroller == null) {
          return;
        }

        const { top, bottom } = scroller.getBoundingClientRect();
        const speed = (distance: number) =>
          Math.ceil(((EDGE_SCROLL_THRESHOLD - Math.max(0, distance)) / EDGE_SCROLL_THRESHOLD) * EDGE_SCROLL_SPEED);
        if (scrolling.current.y - top < EDGE_SCROLL_THRESHOLD) {
          scroller.scrollTop -= speed(scrolling.current.y - top);
        } else if (bottom - scrolling.current.y < EDGE_SCROLL_THRESHOLD) {
          scroller.scrollTop += speed(bottom - scrolling.current.y);
        }
        scrolling.current.frame = requestAnimationFrame(step);
      };
      scrolling.current = { y, frame: requestAnimationFrame(step) };
    },
    stop() {
      if (scrolling.current !== null) {
        cancelAnimationFrame(scrolling.current.frame);
        scrolling.current = null;
      }
    },
  };
}

function rowPath(event: Event): string | undefined {
  const row = event.composedPath().find((node) => node instanceof HTMLElement && node.dataset.itemPath !== undefined);
  return row instanceof HTMLElement ? row.dataset.itemPath : undefined;
}
