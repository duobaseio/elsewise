import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { EditorDocumentLayout } from '@elsewise/plugin';
import { useEffect, useRef } from 'react';
import { type EditorSource, useEditorExtensions } from '@/editor/layouts/layout';

const BLOB: EditorSource = { type: 'blob' };
const PREVIEW: EditorDocumentLayout = { type: 'preview' };

export interface PreviewLayoutProps {
  /**
   * The sample's path, for its language to be found by, e.g. `main.rs`.
   */
  readonly relativePath: string;
  readonly code: string;
}

export function PreviewLayout({ relativePath, code }: PreviewLayoutProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);

  const { core } = useEditorExtensions(view, {
    source: BLOB,
    relativePath,
    code,
    layout: PREVIEW,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the extensions are only read on build.
  useEffect(() => {
    if (host.current === null) {
      return;
    }

    const editor = new EditorView({ state: EditorState.create({ doc: code, extensions: core }), parent: host.current });
    view.current = editor;

    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [code]);

  return <div className="h-full" ref={host} />;
}
