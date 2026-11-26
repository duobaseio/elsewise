import { FileIcon } from '@elsewise/components/components/file-icon';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { DefaultTab } from '../route';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

/**
 * A file's tab, which is marked while the file has unsaved changes.
 */
export function FileTab(props: IDockviewPanelHeaderProps<{ path: string }>) {
  const { daemon, project, workspace } = route.useParams();
  const { files } = useApplicationManager();
  const { path } = props.params;
  const subscribeFiles = useCallback((listener: () => void) => files.onChange(listener), [files]);
  const file = useSyncExternalStore(subscribeFiles, () => files.get({ daemon, project, workspace }, path));
  const subscribe = useCallback((listener: () => void) => file?.onChange(listener) ?? (() => {}), [file]);
  const dirty = useSyncExternalStore(subscribe, () => file?.document != null);

  return <DefaultTab {...props} icon={<FileIcon name={path.slice(path.lastIndexOf('/') + 1)} />} dirty={dirty} />;
}
