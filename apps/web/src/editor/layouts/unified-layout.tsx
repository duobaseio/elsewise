import { getChunks, getOriginalDoc, updateOriginalDoc } from '@codemirror/merge';
import { ChangeSet, EditorState, type Extension, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { iconUrl, useIcons } from '@elsewise/components/components/icon';
import type { EditorDocumentLayout } from '@elsewise/plugin';
import { type CSSProperties, type RefObject, useEffect, useRef } from 'react';
import { EditorContextMenu } from '@/editor/context-menu';
import { unifiedDiff } from '@/editor/diff';
import { useEditorManager } from '@/editor/editor-manager';
import {
  applyPlugins,
  DIFF,
  type EditorSession,
  type EditorSource,
  sessionHistory,
  sessionOf,
  useEditorExtensions,
} from '@/editor/layouts/layout';

const EDITOR: EditorDocumentLayout = { type: 'editor' };
const UNIFIED: EditorDocumentLayout = { type: 'unified' };

export interface UnifiedLayoutProps {
  readonly source: EditorSource;
  /**
   * The file's path, relative to the worktree's root, e.g. `src/main.ts`.
   */
  readonly relativePath: string;
  readonly code: string;
  /**
   * The base that the file is diffed against inline, or null if it is not diffed.
   */
  readonly base: string | null;
  /**
   * The shared extensions.
   */
  readonly extensions: Extension;
  /**
   * The session that the view continues, and hands to the next layout's view.
   */
  readonly session: RefObject<EditorSession | null>;
}

export function UnifiedLayout({ source, relativePath, code, base, extensions, session }: UnifiedLayoutProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const editorManager = useEditorManager();
  const icons = useIcons();

  const { document, core, plugins, portal, lineSeparator } = useEditorExtensions(view, {
    source,
    relativePath,
    code,
    layout: base === null ? EDITOR : UNIFIED,
  });
  const diff = document === null ? null : base;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the extensions, `diff` and session are only read on build.
  useEffect(() => {
    if (host.current === null) {
      return;
    }

    const previous = session.current?.source === source.type && session.current.code === code ? session.current : null;
    session.current = null;

    const state = EditorState.create({
      doc: previous?.doc ?? code,
      selection: previous?.selection,
      extensions: [core, extensions, DIFF.of(diff === null ? [] : unifiedDiff(diff)), sessionHistory(previous)],
    });
    const editor = new EditorView({ state, parent: host.current });
    applyPlugins(editor, plugins);

    if (previous !== null) {
      editor.dispatch({ effects: EditorView.scrollIntoView(previous.top, { y: 'start' }) });
    }

    view.current = editor;

    return () => {
      session.current = sessionOf(editor, source.type, code);
      editorManager.deactivate(editor);
      editor.destroy();
      view.current = null;
    };
  }, [code, lineSeparator, source.type]);

  // Shows the base inline, replaces it, or stops showing it.
  useEffect(() => {
    const editor = view.current;
    if (editor === null) {
      return;
    }

    if (diff === null) {
      editor.dispatch({ effects: DIFF.reconfigure([]) });
    } else if (getChunks(editor.state) === null) {
      editor.dispatch({ effects: DIFF.reconfigure(unifiedDiff(diff)) });
    } else {
      // Split as the merge view splits a base, so that a base with other line endings than the file's is equal.
      const original = getOriginalDoc(editor.state);
      const next = Text.of(diff.split(/\r?\n/));
      if (!original.eq(next)) {
        const changes = ChangeSet.of({ from: 0, to: original.length, insert: next }, original.length);
        editor.dispatch({ effects: updateOriginalDoc.of({ doc: next, changes }) });
      }
    }
  }, [diff]);

  return (
    <>
      <EditorContextMenu view={view}>
        <div
          className="h-full"
          ref={host}
          // The icons are passed as CSS variables since CodeMirror creates the fold markers and tooltips outside React.
          style={
            {
              '--fold-marker': `url("${iconUrl(icons.expand)}")`,
              '--external-link': `url("${iconUrl(icons.external)}")`,
            } as CSSProperties
          }
        />
      </EditorContextMenu>
      {portal}
    </>
  );
}
