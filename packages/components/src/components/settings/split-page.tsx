'use client';

import { type ISplitviewPanelProps, Orientation, SplitviewReact, type SplitviewReadyEvent } from 'dockview-react';
import { createContext, type ReactNode, useCallback, useContext, useRef } from 'react';

import 'dockview-react/dist/styles/dockview.css';
import './split-page.css';

export type SplitPageProps = {
  /**
   * The page's title.
   */
  title: ReactNode;

  /**
   * The preview beside the rows.
   */
  preview: ReactNode;

  /**
   * The page's rows.
   */
  children?: ReactNode;
};

const SplitContext = createContext<{ form: ReactNode; preview: ReactNode }>({ form: null, preview: null });

const PreviewSizeContext = createContext<(width: number) => void>(() => {});

const PANELS = { form: FormPanel, preview: PreviewPanel };

/**
 * A settings page with a live preview beside its rows.
 *
 * Fills its parent, which must have a height.
 */
export function SplitPage({ title, preview, children }: SplitPageProps) {
  const onReady = (event: SplitviewReadyEvent) => {
    event.api.addPanel({
      id: 'form',
      component: 'form' satisfies keyof typeof PANELS,
      minimumSize: 600,
      maximumSize: 672,
    });
    event.api.addPanel({ id: 'preview', component: 'preview' satisfies keyof typeof PANELS, minimumSize: 384 });
  };

  return (
    <SplitContext
      value={{
        form: (
          <>
            <h1 className="text-heading-lg">{title}</h1>
            {children}
          </>
        ),
        preview,
      }}
    >
      <div className="settings-split-page h-full" data-slot="split-page">
        <SplitviewReact
          components={PANELS}
          onReady={onReady}
          orientation={Orientation.HORIZONTAL}
          styles={{ separatorBorder: 'transparent' }}
        />
      </div>
    </SplitContext>
  );
}

function FormPanel(_props: ISplitviewPanelProps) {
  return (
    <div className="h-full pr-2">
      <div className="flex h-full flex-col gap-8 overflow-y-auto p-8 pr-6">{useContext(SplitContext).form}</div>
    </div>
  );
}

function PreviewPanel({ api }: ISplitviewPanelProps) {
  const pane = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const setSize = useCallback(
    (width: number) => {
      if (pane.current && box.current) {
        api.setSize({ size: width + pane.current.offsetWidth - box.current.clientWidth });
      }
    },
    [api],
  );

  return (
    <PreviewSizeContext value={setSize}>
      <div className="flex h-full flex-col py-8 pr-8" ref={pane}>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border" ref={box}>
          {useContext(SplitContext).preview}
        </div>
      </div>
    </PreviewSizeContext>
  );
}

/**
 * Returns a function that resizes the preview to `width`.
 */
export function usePreviewSize(): (width: number) => void {
  return useContext(PreviewSizeContext);
}
