import { Button } from '@elsewise/components/components/button';
import { DockToolHeader } from '@elsewise/components/components/dock';
import { Icon } from '@elsewise/components/components/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { cn } from '@elsewise/components/lib/utils';
import type { Panel } from '@elsewise/frontend-plugin';
import { createFileRoute } from '@tanstack/react-router';
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type SerializedDockview,
} from 'dockview-react';
import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ApplicationManagerContext, useApplicationManager } from '@/application-context';
import { useWorkspaceState, useWorkspaceStateStore } from '@/projects/workspace-state-store';
import { DraggableDock } from './-dock/draggable-dock';
import { DraggableTab } from './-dock/draggable-tab';
import { TabActions } from './-dock/tab-actions';
import { CloseFileDialog } from './-file/close-file-dialog';
import { DeleteEntriesDialog } from './-file-tree/delete-entries-dialog';
import { NewEntryDialog } from './-file-tree/new-entry-dialog';
import { OverwriteEntriesDialog } from './-file-tree/overwrite-entries-dialog';
import { PasteEntriesDialog } from './-file-tree/paste-entries-dialog';
import { CloseTerminalDialog } from './-terminal/close-terminal-dialog';

export const Route = createFileRoute('/_shell/$daemon/$project/$workspace')({
  component: WorkspaceRoute,
  wrapInSuspense: true,
});

const THEME = { name: 'elsewise', className: 'dockview-theme-elsewise' };

function WorkspaceRoute() {
  const { daemon, project, workspace } = Route.useParams();
  const store = useWorkspaceStateStore();
  const { dock: layout } = useWorkspaceState({ daemon, project, workspace });
  const onLayoutChange = useCallback(
    (layout: SerializedDockview) => store.update({ daemon, project, workspace }, { dock: layout }),
    [store, daemon, project, workspace],
  );

  const { docks } = useApplicationManager();
  const key = JSON.stringify([daemon, project, workspace]);
  const [view, setView] = useState<{ key: string; api: DockviewApi } | null>(null);
  useEffect(() => {
    if (view?.key !== key) {
      return undefined;
    }

    const dock = docks.attach({ daemon, project, workspace }, view.api);
    return () => docks.detach(dock);
  }, [daemon, project, workspace, key, docks, view]);

  return (
    <>
      <WorkspaceDock
        key={key}
        layout={layout}
        onDockviewReady={(api) => setView({ key, api })}
        onLayoutChange={onLayoutChange}
      />
      <NewEntryDialog />
      <DeleteEntriesDialog />
      <PasteEntriesDialog />
      <OverwriteEntriesDialog />
      <CloseFileDialog />
      <CloseTerminalDialog />
    </>
  );
}

export function WorkspaceDock({
  layout,
  onDockviewReady,
  onLayoutChange,
}: {
  /**
   * The layout to restore, as the dock serialized it.
   */
  layout?: unknown;
  onDockviewReady?: (api: DockviewApi) => void;
  onLayoutChange?: (layout: SerializedDockview) => void;
}) {
  const [dockview, setDockview] = useState<DockviewApi | null>(null);
  const { panelComponents } = useApplicationManager().docks;
  const tabs = useMemo(
    () => Object.fromEntries(panelComponents.map((component) => [component.type, component.tab])),
    [panelComponents],
  );
  const panels = useMemo(
    () => Object.fromEntries(panelComponents.map((component) => [component.type, component.panel])),
    [panelComponents],
  );

  useEffect(() => {
    if (dockview && onLayoutChange) {
      const disposable = dockview.onDidLayoutChange(() => onLayoutChange(dockview.toJSON()));
      return () => disposable.dispose();
    }
    return undefined;
  }, [dockview, onLayoutChange]);

  const onReady = (event: DockviewReadyEvent) => {
    if (layout != null) {
      try {
        // An invalid layout makes fromJSON throw.
        event.api.fromJSON(layout as SerializedDockview);
        setDockview(event.api);
        onDockviewReady?.(event.api);
        return;
      } catch (error) {
        console.error('Restoring the dock failed', error);
        event.api.clear();
      }
    }

    event.api.addPanel({
      id: 'fileTree',
      tabComponent: 'fileTree' satisfies Panel['type'],
      component: 'fileTree' satisfies Panel['type'],
      title: 'Files',
      params: { path: '/' },
      minimumWidth: 10,
      minimumHeight: 10,
    });
    event.api.addPanel({
      id: 'placeholder',
      tabComponent: 'placeholder' satisfies Panel['type'],
      component: 'placeholder' satisfies Panel['type'],
      position: { referencePanel: 'fileTree', direction: 'left' },
      minimumWidth: 10,
      minimumHeight: 10,
    });
    event.api.getPanel('fileTree')?.group.api.setSize({ width: Math.min(350, Math.floor(event.api.width / 4)) });
    setDockview(event.api);
    onDockviewReady?.(event.api);
  };

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <DraggableDock dockview={dockview}>
          <DockviewReact
            components={panels}
            disableDnd
            disableFloatingGroups
            disableTabsOverflowList
            leftHeaderActionsComponent={TabActions}
            onReady={onReady}
            tabComponents={tabs}
            theme={THEME}
          />
        </DraggableDock>
      </div>
      <ToolStripe />
    </div>
  );
}

/**
 * Tool tabs: icon + title, no close — tools hide via the stripe, not the tab. `data-tabless` is the adapter CSS hook for
 * tool-specific state painting.
 */
export function FileTreeTab(props: IDockviewPanelHeaderProps) {
  return (
    <>
      <span data-tabless hidden />
      <DraggableTab api={props.api} />
      <DockToolHeader title={props.api.title} />
    </>
  );
}

// TODO: The stripe is clipped  for a frame while the window resizes as Chromium shows a resized window with the page's
//  previous frame. We need something like https://github.com/electron/electron/pull/55415 for macOS.
export function ToolStripe() {
  const docks = useContext(ApplicationManagerContext)?.docks;
  const fileTreeVisible = useSyncExternalStore(
    (listener) => docks?.onChange(listener) ?? (() => {}),
    () =>
      docks?.active?.groups.find((group) => group.panels.some((panel) => panel.type === 'fileTree'))?.shown !== null,
  );

  const toggleFiles = () => {
    const dock = docks?.active;
    const fileTree = dock?.panels.find((panel) => panel.type === 'fileTree');
    if (dock == null || fileTree === undefined) {
      return;
    }

    if (fileTreeVisible) {
      dock.hide(fileTree);
    } else {
      dock.show(fileTree);
    }
  };

  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 border-l border-border bg-surface py-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Toggle file tree"
              aria-pressed={fileTreeVisible}
              className={cn('text-text-3', fileTreeVisible && 'bg-layer-selected')}
              onClick={toggleFiles}
              size="icon"
              variant="ghost"
            />
          }
        >
          <Icon className="size-5" name="files" />
        </TooltipTrigger>
        <TooltipContent side="left">Files</TooltipContent>
      </Tooltip>
    </div>
  );
}
