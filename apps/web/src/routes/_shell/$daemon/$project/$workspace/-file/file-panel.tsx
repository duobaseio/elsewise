import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { daemonQuery } from '@/daemon';
import type { FileHandle, FileHandleState } from '@/fs/file-handle';
import { useWorkspace } from '@/projects/workspace-manager';
import { usePanelFocus } from '../-dock/panel';
import { EditorFileView, type EditorFileViewParams } from './editor-file-view';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

const LOADING: FileHandleState = { type: 'loading' };

type FileViewParams = EditorFileViewParams;

/**
 * What a file's panel keeps in the dock, which is saved with its layout.
 */
interface FilePanelParams {
  /**
   * The file, relative to the workspace's root.
   */
  path: string;
  /**
   * The view the file was last shown in, and what that view keeps.
   */
  view?: FileViewParams;
}

export function FilePanel(props: IDockviewPanelProps<FilePanelParams>) {
  const { daemon, project, workspace } = route.useParams();
  const client = useQuery(daemonQuery(daemon)).data;
  const root = useWorkspace({ daemon, project, workspace })?.absolutePath;
  const { files } = useApplicationManager();
  const [file, setFile] = useState<FileHandle | null>(null);
  // Read without being a dependency of the effect, so that a rename keeps the handle instead of opening a new one.
  const path = useEffectEvent(() => props.params.path);

  useEffect(() => {
    if (client === undefined || root === undefined) {
      return undefined;
    }

    const next = files.open({ daemon, project, workspace }, client.fileSystem, root, path());
    setFile(next);

    return () => {
      files.close({ daemon, project, workspace }, next);
      setFile(null);
    };
  }, [client, root, files, daemon, project, workspace]);

  const subscribe = useCallback((listener: () => void) => file?.onChange(listener) ?? (() => {}), [file]);
  const state = useSyncExternalStore(subscribe, () => file?.state ?? LOADING);
  const relativePath = useSyncExternalStore(subscribe, () => file?.relativePath);
  const onViewParamsChange = useCallback((view: FileViewParams) => props.api.updateParameters({ view }), [props.api]);

  // A split comparison has two editors.
  usePanelFocus(
    state.type === 'text'
      ? (content) => [...content.querySelectorAll<HTMLElement>('.cm-content')].at(-1)?.focus()
      : null,
  );

  if (file === null || relativePath === undefined || state.type === 'loading') {
    return null;
  }

  if (state.type === 'text') {
    return (
      <EditorFileView
        file={file}
        root={file.root}
        relativePath={relativePath}
        params={props.params.view?.type === 'editor' ? props.params.view : undefined}
        onParamsChange={onViewParamsChange}
      />
    );
  }

  // TODO: Show a binary file in a view for its kind, e.g. an image, once there are views besides the editor.
  return (
    <div className="flex h-full items-center justify-center font-sans text-sm text-text-3">
      {state.type === 'binary' ? 'The file is not text.' : state.message}
    </div>
  );
}
