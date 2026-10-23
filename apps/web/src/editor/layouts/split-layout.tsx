import { MergeView } from '@codemirror/merge';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { iconUrl, useIcons } from '@elsewise/components/components/icon';
import type { EditorDocumentLayout } from '@elsewise/plugin';
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { EditorContextMenu } from '@/editor/context-menu';
import { useEditorManager } from '@/editor/editor-manager';
import {
  applyPlugins,
  type EditorSession,
  type EditorSource,
  sessionHistory,
  sessionOf,
  useEditorExtensions,
} from '@/editor/layouts/layout';

const BASE: EditorDocumentLayout = { type: 'split', side: 'base' };
const TARGET: EditorDocumentLayout = { type: 'split', side: 'target' };

export interface SplitLayoutProps {
  readonly header?: (view: RefObject<EditorView | null>) => ReactNode;
  /**
   * The file's path, relative to the worktree's root, e.g. `src/main.ts`.
   */
  readonly relativePath: string;
  /**
   * The side on the left, e.g. the file in HEAD. A change of its code replaces it in place.
   */
  readonly base: { readonly source: EditorSource; readonly code: string };
  /**
   * The side on the right, e.g. the file in the working tree. A change of its code rebuilds both sides.
   */
  readonly target: { readonly source: EditorSource; readonly code: string };
  /**
   * The shared extensions.
   */
  readonly extensions: Extension;
  /**
   * The session that the target continues, and hands to the next layout's view.
   */
  readonly session: RefObject<EditorSession | null>;
}

export function SplitLayout({ relativePath, base, target, extensions, session, header }: SplitLayoutProps) {
  const host = useRef<HTMLDivElement>(null);
  const baseView = useRef<EditorView>(null);
  const targetView = useRef<EditorView>(null);
  // The side that was last right-clicked, which the context menu runs its commands on.
  const clicked = useRef<EditorView>(null);
  const editorManager = useEditorManager();
  const icons = useIcons();

  const baseExtensions = useEditorExtensions(baseView, {
    source: base.source,
    relativePath,
    code: base.code,
    layout: BASE,
  });
  const targetExtensions = useEditorExtensions(targetView, {
    source: target.source,
    relativePath,
    code: target.code,
    layout: TARGET,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the extensions and the base's code are only read on build.
  useEffect(() => {
    if (host.current === null) {
      return;
    }

    const contextMenu = EditorView.domEventHandlers({
      contextmenu: (_, view) => {
        clicked.current = view;
      },
    });

    const previous =
      session.current?.source === target.source.type && session.current.code === target.code ? session.current : null;
    session.current = null;

    const merge = new MergeView({
      a: { doc: base.code, extensions: [baseExtensions.core, extensions, contextMenu] },
      b: {
        doc: previous?.doc ?? target.code,
        selection: previous?.selection,
        extensions: [targetExtensions.core, extensions, contextMenu, sessionHistory(previous)],
      },
      parent: host.current,
    });
    applyPlugins(merge.a, baseExtensions.plugins);
    applyPlugins(merge.b, targetExtensions.plugins);

    if (previous !== null) {
      merge.b.dispatch({ effects: EditorView.scrollIntoView(previous.top, { y: 'start' }) });
    }

    merge.a.scrollDOM.addEventListener('scroll', () => {
      merge.b.scrollDOM.scrollTop = merge.a.scrollDOM.scrollTop;
    });
    merge.b.scrollDOM.addEventListener('scroll', () => {
      merge.a.scrollDOM.scrollTop = merge.b.scrollDOM.scrollTop;
    });

    baseView.current = merge.a;
    targetView.current = merge.b;
    clicked.current = merge.b;

    return () => {
      session.current = sessionOf(merge.b, target.source.type, target.code);
      editorManager.deactivate(merge.a);
      editorManager.deactivate(merge.b);
      merge.destroy();
      baseView.current = null;
      targetView.current = null;
      clicked.current = null;
    };
  }, [target.code, baseExtensions.lineSeparator, targetExtensions.lineSeparator, base.source.type, target.source.type]);

  // Replaces the base in place, e.g. when git reports a new one.
  useEffect(() => {
    const view = baseView.current;
    // With the base's own line separator, which `toString` does not use.
    if (view !== null && view.state.sliceDoc() !== base.code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: base.code } });
    }
  }, [base.code]);

  return (
    <div className="flex h-full flex-col">
      {header?.(targetView)}
      <div className="min-h-0 flex-1">
        <EditorContextMenu view={clicked}>
          <div
            // The merge view scrolls as a whole by default. Instead, it fills the host and each side scrolls itself.
            className="h-full [&_.cm-mergeView]:h-full [&_.cm-mergeView]:overflow-hidden [&_.cm-mergeViewEditor]:h-full [&_.cm-mergeViewEditors]:h-full [&_.cm-mergeView_.cm-editor]:h-full! [&_.cm-mergeView_.cm-editor_.cm-scroller]:overflow-y-auto! [&_.cm-mergeViewEditor:first-child]:border-r"
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
      </div>
      {baseExtensions.portal}
      {targetExtensions.portal}
    </div>
  );
}
