import { DockTabHeader } from '@elsewise/components/components/dock';
import { FileIcon } from '@elsewise/components/components/file-icon';
import type { FileTreeGitStatus } from '@elsewise/components/components/file-tree';
import type { Panel } from '@elsewise/frontend-plugin';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { type ReactNode, useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import type { DockManager } from '@/dock/dock-manager';
import { absolutePath } from '@/fs/commands';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

const GIT_STATUS_COLORS: Partial<Record<FileTreeGitStatus['status'], string>> = {
  modified: 'text-info',
  added: 'text-success',
  untracked: 'text-error',
  conflict: 'text-warning',
};

/**
 * A file's header, which is marked while the file has unsaved changes.
 */
export function FileHeader(props: Pick<IDockviewPanelHeaderProps<{ path: string }>, 'api' | 'params'>) {
  const { daemon, project, workspace } = route.useParams();
  const { docks, files, git } = useApplicationManager();
  const { path } = props.params;

  const subscribeFiles = useCallback((listener: () => void) => files.onChange(listener), [files]);
  const file = useSyncExternalStore(subscribeFiles, () => files.get({ daemon, project, workspace }, path));
  const subscribe = useCallback((listener: () => void) => file?.onChange(listener) ?? (() => {}), [file]);
  const dirty = useSyncExternalStore(subscribe, () => file?.document != null);

  const subscribeGit = useCallback((listener: () => void) => git.onChange(listener), [git]);
  const status = useSyncExternalStore(subscribeGit, () => git.get({ daemon, project, workspace }, path));
  const color = status === null ? undefined : GIT_STATUS_COLORS[status];

  return (
    <DockTabHeader
      icon={<FileIcon name={path.slice(path.lastIndexOf('/') + 1)} />}
      title={color === undefined ? props.api.title : <span className={color}>{props.api.title}</span>}
      status={dirty && <span aria-label="Unsaved changes" className="size-2 rounded-full bg-current" role="img" />}
      onClose={() => {
        const dock = docks.active;
        const panel = dock?.get(props.api.id);
        if (dock == null || panel == null || !panel.closable) {
          props.api.close();
        } else {
          void dock.close(panel);
        }
      }}
    />
  );
}

export function fileTooltip({ projects }: ApplicationManager, _dock: DockManager, panel: Panel): ReactNode | null {
  if (panel.type !== 'file') {
    return null;
  }

  const workspace = projects.workspaces.active;
  return (
    <span className="whitespace-nowrap">
      {workspace === null ? panel.relativePath : absolutePath(workspace, panel.relativePath)}
    </span>
  );
}
