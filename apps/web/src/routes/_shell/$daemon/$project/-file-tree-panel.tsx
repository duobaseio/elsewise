import { FileTree, useFileTree } from '@elsewise/components/components/file-tree';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useState } from 'react';
import { daemonQuery } from '@/daemon';
import { DirectoryWatcher } from '@/fs/directory-watcher';
import { watchGitStatus } from '@/git/status';
import { workspacesQuery } from '@/projects/workspace-manager';
import { useWorkspaceState, useWorkspaceStateStore } from '@/projects/workspace-state-store';
import { useSettings } from '@/settings/settings';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

export function FileTreePanel(_props: IDockviewPanelProps<{ path: string }>) {
  const { daemon, project, workspace } = route.useParams();
  const client = useQuery(daemonQuery(daemon)).data;
  const root = useQuery({
    ...workspacesQuery(daemon, project),
    select: (workspaces) => workspaces.find((candidate) => candidate.id === workspace)?.absolutePath,
  }).data;
  const gitStatusBadges = useSettings((settings) => settings.appearance.general.gitStatusBadges);

  const store = useWorkspaceStateStore();
  const { fileTree } = useWorkspaceState({ daemon, project, workspace });
  const [restored] = useState(fileTree);
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

    const watcher = new DirectoryWatcher(root, model, client.fileSystem.watchDirectories(), restored);
    const unsubscribe = watchGitStatus(client.git, root, model);
    const stopSaving = model.subscribe(() =>
      store.update({ daemon, project, workspace }, { fileTree: watcher.snapshot() }),
    );
    return () => {
      watcher.dispose();
      unsubscribe();
      stopSaving();
    };
  }, [client, root, model, restored, store, daemon, project, workspace]);

  return <FileTree model={model} gitStatusBadges={gitStatusBadges} aria-label="Files" />;
}
