import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { cn } from '@elsewise/components/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type SerializedDockview,
} from 'dockview-react';
import { type ReactNode, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { ApplicationManagerContext, useApplicationManager } from '@/application-context';
import { useWorkspaceState, useWorkspaceStateStore } from '@/projects/workspace-state-store';
import { DraggableDock } from './-dock/draggable-dock';
import { DraggableTab } from './-dock/draggable-tab';
import { TabActions } from './-dock/tab-actions';
import { FilePanel } from './-file/file-panel';
import { FileTab } from './-file/file-tab';
import { DeleteEntriesDialog } from './-file-tree/delete-entries-dialog';
import { FileTreePanel } from './-file-tree/file-tree-panel';
import { NewEntryDialog } from './-file-tree/new-entry-dialog';
import { OverwriteEntriesDialog } from './-file-tree/overwrite-entries-dialog';
import { PasteEntriesDialog } from './-file-tree/paste-entries-dialog';
import { Placeholder, PlaceholderTab } from './-placeholder/placeholder';
import { TerminalPanel } from './-terminal/terminal-panel';
import { TerminalTab } from './-terminal/terminal-tab';

export const Route = createFileRoute('/_shell/$daemon/$project/$workspace')({
  component: WorkspaceRoute,
  wrapInSuspense: true,
});

type PanelKind = keyof typeof PANELS;

const TOOL_TABS = { fileTree: FileTreeTab };
const TABS = { ...TOOL_TABS, file: FileTab, terminal: TerminalTab, placeholder: PlaceholderTab };
const PANELS = {
  file: FilePanel,
  terminal: TerminalPanel,
  fileTree: FileTreePanel,
  placeholder: Placeholder,
};

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
    </>
  );
}

export function WorkspaceDock({
  panels = PANELS,
  tabs = TABS,
  layout,
  onDockviewReady,
  onLayoutChange,
}: {
  panels?: typeof PANELS;
  tabs?: typeof TABS;
  /**
   * The layout to restore, as the dock serialized it.
   */
  layout?: unknown;
  onDockviewReady?: (api: DockviewApi) => void;
  onLayoutChange?: (layout: SerializedDockview) => void;
}) {
  const [dockview, setDockview] = useState<DockviewApi | null>(null);

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
      tabComponent: 'fileTree' satisfies PanelKind,
      component: 'fileTree' satisfies PanelKind,
      title: 'Files',
      params: { path: '/' },
      minimumWidth: 10,
      minimumHeight: 10,
    });
    event.api.addPanel({
      id: 'placeholder',
      tabComponent: 'placeholder' satisfies PanelKind,
      component: 'placeholder' satisfies PanelKind,
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
            defaultTabComponent={DefaultTab}
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

export function DefaultTab({
  icon,
  dirty = false,
  onClose,
  ...props
}: IDockviewPanelHeaderProps & {
  /**
   * The icon before the tab's title.
   */
  icon?: ReactNode;
  /**
   * Whether the panel has unsaved changes, which marks the tab with a dot that turns into the close button on hover.
   */
  dirty?: boolean;
  onClose?: () => void;
}) {
  const docks = useContext(ApplicationManagerContext)?.docks;

  return (
    <div className="flex h-full items-center gap-1.5 px-2 text-base/6" data-dirty={dirty || undefined}>
      <DraggableTab api={props.api} />
      {icon}
      <span>{props.api.title}</span>
      <Button
        aria-label={`Close ${props.api.title}`}
        className={cn(
          '-mx-0.5 size-4 text-text-3 opacity-0 focus-visible:opacity-100 in-[.dv-active-tab]:opacity-100 in-[.dv-tab:hover]:opacity-100',
          dirty && 'opacity-100',
        )}
        onClick={(event) => {
          event.stopPropagation();
          if (onClose !== undefined) {
            onClose();
            return;
          }

          const dock = docks?.active;
          const panel = dock?.get(props.api.id);
          if (dock == null || panel == null || !panel.closable) {
            props.api.close();
          } else {
            void dock.close(panel);
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        size="icon-xs"
        variant="ghost"
      >
        {dirty && <span aria-hidden className="size-2 rounded-full bg-current in-[.dv-tab:hover]:hidden" />}
        <Icon className={cn('size-3', dirty && 'hidden in-[.dv-tab:hover]:block')} name="close" />
      </Button>
    </div>
  );
}

/**
 * Tool tabs: icon + title, no close — tools hide via the stripe, not the tab. `data-tabless` is the adapter CSS hook for
 * tool-specific state painting.
 */
export function FileTreeTab(props: IDockviewPanelHeaderProps) {
  return (
    <div className="flex h-full items-center gap-1.5 px-4 text-base text-text-2" data-tabless>
      <DraggableTab api={props.api} />
      <span>{props.api.title}</span>
    </div>
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
