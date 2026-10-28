import { MergeView } from '@codemirror/merge';
import { type Extension, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { iconUrl, useIcons } from '@elsewise/components/components/icon';
import type { EditorDocumentLayout } from '@elsewise/plugin';
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { EditorContextMenu } from '@/editor/context-menu/context-menu';
import { drawDiffs, revertGutter } from '@/editor/diff/diff';
import { useRevertButtons } from '@/editor/diff/revert-buttons';
import { useEditorManager } from '@/editor/editor-manager';
import {
  applyPlugins,
  type EditorSession,
  type EditorSource,
  sessionHistory,
  sessionOf,
  useEditorExtensions,
} from '@/editor/layouts/layout';
import { splitScrollbar } from '@/editor/layouts/split-scrollbar';

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
  /**
   * Where the sides split, as the base's fraction of the width, which is kept across layouts.
   */
  readonly ratio: RefObject<number>;
}

const SIDE_MIN_WIDTH = 240;

export function SplitLayout({ relativePath, base, target, extensions, session, header, ratio }: SplitLayoutProps) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const [split, setSplit] = useState(ratio.current);
  const [resizing, setResizing] = useState(false);
  const resize = (next: number) => {
    const width = root.current?.getBoundingClientRect().width ?? 0;
    const least = width > 0 ? Math.min(SIDE_MIN_WIDTH / width, 0.5) : 0;
    const clamped = Math.min(Math.max(next, least), 1 - least);
    ratio.current = clamped;
    setSplit(clamped);
  };

  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const baseView = useRef<EditorView>(null);
  const targetView = useRef<EditorView>(null);
  // The side that was last right-clicked, which the context menu runs its commands on.
  const clicked = useRef<EditorView>(null);
  const editorManager = useEditorManager();
  const icons = useIcons();
  const revert = useRevertButtons('revert-chunk');

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
      a: { doc: base.code, extensions: [baseExtensions.core, extensions, contextMenu, drawDiffs()] },
      b: {
        doc: previous?.doc ?? target.code,
        selection: previous?.selection,
        extensions: [
          targetExtensions.core,
          extensions,
          contextMenu,
          drawDiffs(),
          target.source.type === 'workingTree' ? Prec.highest(revertGutter(revert.buttons)) : [],
          sessionHistory(previous),
          splitScrollbar(),
        ],
      },
      parent: host.current,
    });
    applyPlugins(merge.a, baseExtensions.plugins);
    applyPlugins(merge.b, targetExtensions.plugins);

    if (previous !== null) {
      merge.b.dispatch({ effects: EditorView.scrollIntoView(previous.top, { y: 'start' }) });
    }

    // Merge view's default scrolling is fucking terrible. We handle scrolling ourselves as simply syncing the two
    // editor view's scroll result in unacceptable jank as one side will trail by one frame behind the other.
    //
    // Syncs `other` and `view`. Sets leveled to prevent desync caused by a and b clamping the same scroll at different
    // positions.
    let leveled: EditorView | null = null;
    const sync = (view: EditorView, other: EditorView) => {
      if (leveled === view) {
        leveled = null;
        return;
      }

      const offset = other.scrollDOM.getBoundingClientRect().top - view.scrollDOM.getBoundingClientRect().top;
      const before = other.scrollDOM.scrollTop;
      other.scrollDOM.scrollTop = view.scrollDOM.scrollTop + offset;
      if (other.scrollDOM.scrollTop !== before) {
        leveled = other;
      }

      // Draws the rows scrolled to in this frame rather than the next, which would cause a blank band after a long jump.
      other.requestMeasure();
    };
    merge.a.scrollDOM.addEventListener('scroll', () => sync(merge.a, merge.b));
    merge.b.scrollDOM.addEventListener('scroll', () => sync(merge.b, merge.a));

    // Re-sync on searchbar open/close.
    const resized = new ResizeObserver(() => sync(merge.b, merge.a));
    resized.observe(merge.a.scrollDOM);
    resized.observe(merge.b.scrollDOM);

    // Captures wheel scroll.
    let wheeled: { view: EditorView; other: EditorView; top: number } | null = null;
    let frame = 0;
    merge.dom.addEventListener(
      'wheel',
      (event) => {
        // Only target the editor and its scrollbar, so that scrolling other components in an editor still works.
        const side = event.target instanceof Element ? event.target.closest('.cm-scroller, .cm-scrollbar') : null;
        if (side === null || event.ctrlKey || event.shiftKey || event.deltaY === 0) {
          return;
        }

        event.preventDefault();

        const [view, other] = merge.a.dom.contains(side) ? [merge.a, merge.b] : [merge.b, merge.a];
        // Chromium never measures in lines from my understanding (23/10/2026).
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? view.scrollDOM.clientHeight : 1;
        view.scrollDOM.scrollLeft += event.deltaX * unit;

        wheeled = { view, other, top: (wheeled?.top ?? 0) + event.deltaY * unit };
        frame ||= requestAnimationFrame(() => {
          frame = 0;
          if (wheeled === null) {
            return;
          }

          const { view, other, top } = wheeled;
          wheeled = null;
          view.scrollDOM.scrollTop += top;
          sync(view, other);
        });
      },
      { passive: false },
    );

    baseView.current = merge.a;
    targetView.current = merge.b;
    clicked.current = merge.b;

    return () => {
      resized.disconnect();
      cancelAnimationFrame(frame);
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

  // Drags the line between the sides, with the editors ignoring the pointer meanwhile, e.g. not selecting or hovering.
  const drag = (event: ReactPointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setResizing(true);
    const move = (event: PointerEvent) => {
      const rect = root.current?.getBoundingClientRect();
      if (rect !== undefined && rect.width > 0) {
        resize((event.clientX - rect.left) / rect.width);
      }
    };
    stop.current = () => {
      setResizing(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop.current ?? move);
      stop.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop.current);
  };

  return (
    <div
      ref={root}
      className="relative flex h-full flex-col data-resizing:cursor-col-resize data-resizing:select-none [&[data-resizing]_.cm-editor]:pointer-events-none"
      data-resizing={resizing || undefined}
      style={{ '--split': `${split * 100}%` } as CSSProperties}
    >
      {header?.(targetView)}
      <div
        className="absolute inset-y-0 left-[calc(var(--split)-4px)] z-10 w-1 cursor-col-resize hover:bg-border hover:transition-colors hover:delay-500 hover:duration-100 hover:ease-in-out data-resizing:bg-border data-resizing:transition-colors data-resizing:delay-500 data-resizing:duration-100 data-resizing:ease-in-out"
        // Pointer-only, as the dock's sashes are.
        aria-hidden="true"
        data-slot="split-handle"
        data-resizing={resizing || undefined}
        onPointerDown={drag}
        onDoubleClick={() => resize(0.5)}
      />
      <div className="min-h-0 flex-1">
        <EditorContextMenu view={clicked}>
          <div
            className="h-full [&_.cm-mergeView]:h-full [&_.cm-mergeView]:overflow-hidden [&_.cm-mergeViewEditor]:h-full [&_.cm-mergeViewEditors]:h-full [&_.cm-mergeView_.cm-editor]:h-full! [&_.cm-mergeView_.cm-editor_.cm-scroller]:overflow-y-auto! [&_.cm-mergeViewEditor:first-child]:border-r [&_.cm-mergeViewEditor:first-child]:grow-0! [&_.cm-mergeViewEditor:first-child]:basis-(--split)! [&_.cm-mergeViewEditor:first-child_.cm-scrollbar-markers]:hidden [&_.cm-mergeViewEditor:first-child_.cm-scroller::-webkit-scrollbar]:w-0! [&_.cm-mergeViewEditor:last-child_.cm-scroller::-webkit-scrollbar-thumb:vertical]:bg-transparent!"
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
      {revert.portal}
    </div>
  );
}
