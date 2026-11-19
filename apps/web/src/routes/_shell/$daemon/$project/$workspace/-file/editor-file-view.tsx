import type { DiffLayout } from '@elsewise/frontend-plugin';
import { useEffect, useMemo, useState } from 'react';
import { DiffState } from '@/editor/diff/diff';
import { Editor } from '@/editor/editor';
import type { FileHandle } from '@/fs/file-handle';
import { useSettings } from '@/settings/settings';

/**
 * What the editor keeps in its file's panel, which is saved with the dock's layout.
 */
export interface EditorFileViewParams {
  type: 'editor';
  /**
   * The source the file is compared with, or null if it is not compared.
   */
  diff?: string | null;
  /**
   * The layout the comparison is shown in.
   */
  layout?: DiffLayout;
}

/**
 * Shows a text file in the code editor.
 */
export function EditorFileView({
  file,
  root,
  relativePath,
  params,
  onParamsChange,
}: {
  file: FileHandle;
  /**
   * The absolute path of the workspace that the file is in.
   */
  root: string;
  /**
   * The file's path, relative to the workspace's root.
   */
  relativePath: string;
  params: EditorFileViewParams | undefined;
  onParamsChange: (params: EditorFileViewParams) => void;
}) {
  const defaultLayout = useSettings((settings) => settings.editor.diffLayout);
  const [diff] = useState(() => new DiffState(params?.diff ?? null, params?.layout ?? defaultLayout));
  const [initial] = useState(() => (file.state.type === 'text' ? file.state.content : ''));
  const rootUrl = useMemo(() => {
    const url = new URL('file:///');
    url.pathname = `${root}/`;
    return url;
  }, [root]);

  useEffect(() => {
    const dispose = diff.onChange(() => onParamsChange({ type: 'editor', diff: diff.source, layout: diff.layout }));
    return () => {
      void dispose();
    };
  }, [diff, onParamsChange]);

  return (
    <Editor
      root={rootUrl}
      relativePath={relativePath}
      diff={diff}
      content={{ label: 'Current', code: initial }}
      file={file}
    />
  );
}
