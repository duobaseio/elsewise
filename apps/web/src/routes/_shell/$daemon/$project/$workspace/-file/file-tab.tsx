import { DockTabHeader } from '@elsewise/components/components/dock';
import { FileIcon } from '@elsewise/components/components/file-icon';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { DraggableTab } from '../-dock/draggable-tab';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

/**
 * A file's tab, which is marked while the file has unsaved changes.
 */
export function FileTab(props: IDockviewPanelHeaderProps<{ path: string }>) {
  const { daemon, project, workspace } = route.useParams();
  const { docks, files } = useApplicationManager();
  const { path } = props.params;
  const subscribeFiles = useCallback((listener: () => void) => files.onChange(listener), [files]);
  const file = useSyncExternalStore(subscribeFiles, () => files.get({ daemon, project, workspace }, path));
  const subscribe = useCallback((listener: () => void) => file?.onChange(listener) ?? (() => {}), [file]);
  const dirty = useSyncExternalStore(subscribe, () => file?.document != null);

  return (
    <>
      <DraggableTab api={props.api} />
      <DockTabHeader
        icon={<FileIcon name={path.slice(path.lastIndexOf('/') + 1)} />}
        title={props.api.title}
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
    </>
  );
}
