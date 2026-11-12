import { DEFAULT_WORKSPACE_STATE } from '@elsewise/bridge';
import { FileTree, useFileTree } from '@elsewise/components/components/file-tree';
import { toast } from '@elsewise/components/components/toast';
import type { FileTreeSelection } from '@elsewise/frontend-plugin';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useRef } from 'react';
import { useApplicationManager } from '@/application-context';
import { useCommandManager } from '@/command/command-manager';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { runFileTreeKeys } from '@/command/keymap/keymap';
import { daemonQuery } from '@/daemon';
import { DirectoryWatcher } from '@/fs/directory-watcher';
import { useFileTreeManager } from '@/fs/file-tree-manager';
import { type PasteEntry, pasteEntries } from '@/fs/paste';
import { watchGitStatus } from '@/git/status';
import { sameWorkspace, useWorkspace } from '@/projects/workspace-manager';
import { useWorkspaceStateStore } from '@/projects/workspace-state-store';
import { useSettings } from '@/settings/settings';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

export function FileTreePanel(_props: IDockviewPanelProps<{ path: string }>) {
  const { daemon, project, workspace: workspaceId } = route.useParams();
  const client = useQuery(daemonQuery(daemon)).data;
  const gitStatusBadges = useSettings((settings) => settings.appearance.general.gitStatusBadges);
  const indentGuides = useSettings((settings) => settings.appearance.general.indentGuides);
  const workspace = useWorkspace({ daemon, project, workspace: workspaceId });
  const root = workspace?.absolutePath;

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
  const dragged = useRef<readonly string[] | null>(null);

  const store = useWorkspaceStateStore();
  const drop = (paths: readonly string[], folder: string, moved: boolean) => {
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

    const restore = (failed: readonly PasteEntry[]) => {
      for (const entry of moved ? failed : []) {
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
    onRename: ({ sourcePath, destinationPath }) => {
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
    onDropComplete: ({ draggedPaths, target }) => drop(draggedPaths, target.directoryPath ?? '', true),
    onDropError: (_, { draggedPaths, target }) => drop(draggedPaths, target.directoryPath ?? '', false),
  });

  useEffect(() => {
    if (client === undefined || root === undefined) {
      return undefined;
    }

    const id = { daemon, project, workspace: workspaceId };
    const watcher = new DirectoryWatcher(
      root,
      model,
      client.fileSystem.watchDirectories(),
      store.get(id)?.fileTree ?? DEFAULT_WORKSPACE_STATE.fileTree,
    );
    const unsubscribe = watchGitStatus(client.git, root, model);
    const stopSaving = model.subscribe(() => store.update(id, { fileTree: watcher.snapshot() }));
    return () => {
      watcher.dispose();
      unsubscribe();
      stopSaving();
    };
  }, [client, root, model, store, daemon, project, workspaceId]);

  const renaming = useFileTreeManager((manager) => manager.renaming);
  useEffect(() => {
    if (renaming !== null && sameWorkspace(renaming.workspace, { daemon, project, workspace: workspaceId })) {
      fileTree.renaming = null;
      model.startRenaming(renaming.path);
    }
  }, [renaming, fileTree, model, daemon, project, workspaceId]);

  const overRow = (event: Event) =>
    event.composedPath().some((node) => node instanceof HTMLElement && node.dataset.itemPath !== undefined);

  return (
    <CommandContextMenu
      menu={menu}
      target={target}
      opens={(event) => {
        const row = event
          .composedPath()
          .find((node) => node instanceof HTMLElement && node.dataset.itemPath !== undefined);
        const path = row instanceof HTMLElement ? row.dataset.itemPath : undefined;
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
        // biome-ignore lint/a11y/noStaticElementInteractions: the keys run commands on the tree's selection inside.
        <div
          onKeyDown={(event) => {
            if (workspace !== undefined) {
              runFileTreeKeys(commands, { workspace, paths: [...model.getSelectedPaths()] }, event.nativeEvent);
            }
          }}
          onDragStart={(event) => {
            const paths = model.getSelectedPaths();
            dragged.current = event.nativeEvent.defaultPrevented
              ? null
              : paths.filter(
                  (path) => !paths.some((other) => other !== path && other.endsWith('/') && path.startsWith(other)),
                );
          }}
          onDragEnd={() => {
            dragged.current = null;
          }}
          onDragOver={(event) => {
            if (dragged.current !== null && !overRow(event.nativeEvent)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={(event) => {
            if (dragged.current !== null && !overRow(event.nativeEvent)) {
              event.preventDefault();
              drop(dragged.current, '', false);
            }
            dragged.current = null;
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
        aria-label="Files"
      />
    </CommandContextMenu>
  );
}
