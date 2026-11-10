import { DEFAULT_WORKSPACE_STATE } from '@elsewise/bridge';
import { FileTree, useFileTree } from '@elsewise/components/components/file-tree';
import type { FileTreeSelection } from '@elsewise/frontend-plugin';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useRef } from 'react';
import { useCommandManager } from '@/command/command-manager';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { runFileTreeKeys } from '@/command/keymap/keymap';
import { daemonQuery } from '@/daemon';
import { DirectoryWatcher } from '@/fs/directory-watcher';
import { useFileTreeManager } from '@/fs/file-tree-manager';
import { watchGitStatus } from '@/git/status';
import { useWorkspace } from '@/projects/workspace-manager';
import { useWorkspaceStateStore } from '@/projects/workspace-state-store';
import { useSettings } from '@/settings/settings';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

export function FileTreePanel(_props: IDockviewPanelProps<{ path: string }>) {
  const { daemon, project, workspace: workspaceId } = route.useParams();
  const client = useQuery(daemonQuery(daemon)).data;
  const gitStatusBadges = useSettings((settings) => settings.appearance.general.gitStatusBadges);
  const workspace = useWorkspace({ daemon, project, workspace: workspaceId });
  const root = workspace?.absolutePath;

  const commands = useCommandManager();
  const menu = useFileTreeManager((fileTree) => fileTree.contextMenu);
  const clicked = useRef<string | null>(null);
  const target = useRef<FileTreeSelection | null>(null);

  const store = useWorkspaceStateStore();
  const model = useFileTree({
    initialPaths: [],
    // TODO: Rename through FileSystemService.RenameEntry, then let the resulting listing move the row.
    canRename: () => false,
    // TODO: Move through FileSystemService.RenameEntry, as a move is a rename across folders.
    canDrag: () => false,
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

  return (
    <CommandContextMenu
      menu={menu}
      target={target}
      opens={(event) => {
        const row = event
          .composedPath()
          .find((node) => node instanceof HTMLElement && node.dataset.itemPath !== undefined);
        const path = row instanceof HTMLElement ? row.dataset.itemPath : undefined;
        if (path === undefined || workspace === undefined) {
          return false;
        }

        const selected = model.getSelectedPaths();
        const paths = selected.includes(path) ? selected : [path];
        if (paths !== selected) {
          for (const other of selected) {
            model.getItem(other)?.deselect();
          }
          model.getItem(path)?.select();
        }
        clicked.current = path;
        target.current = { workspace, paths: [...paths] };
        return true;
      }}
      onClosed={() => {
        if (clicked.current !== null) {
          model.focusPath(clicked.current);
        }
      }}
      render={
        // biome-ignore lint/a11y/noStaticElementInteractions: the keys run commands on the tree's selection inside.
        <div
          onKeyDown={(event) => {
            if (workspace !== undefined) {
              runFileTreeKeys(commands, { workspace, paths: [...model.getSelectedPaths()] }, event.nativeEvent);
            }
          }}
        />
      }
      className="h-full"
    >
      <FileTree model={model} gitStatusBadges={gitStatusBadges} aria-label="Files" />
    </CommandContextMenu>
  );
}
