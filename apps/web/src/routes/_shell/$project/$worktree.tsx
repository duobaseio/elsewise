import { Button } from '@elsewise/components/components/button';
import { FileTree, useFileTree } from '@elsewise/components/components/file-tree';
import { Icon } from '@elsewise/components/components/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { cn } from '@elsewise/components/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewWillShowOverlayLocationEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import { useEffect, useRef, useState } from 'react';
import { CodeEditor } from '@/components/code-editor/code-editor';

export const Route = createFileRoute('/_shell/$project/$worktree')({
  component: WorkTreeDock,
});

type PanelKind = keyof typeof PANELS;

const TOOL_TABS = { fileTree: FileTab };
const TOOL_PANELS = new Set(['fileTree' satisfies PanelKind]);
const PANELS = {
  editor: EditorPanel,
  terminal: TerminalPanel,
  fileTree: FileTreePanel,
};

// TODO: Make it injectable.
const THEME = { name: 'elsewise', className: 'dockview-theme-elsewise' };

export function WorkTreeDock({
  panels = PANELS,
  onDockviewReady,
}: {
  panels?: typeof PANELS;
  onDockviewReady?: (api: DockviewApi) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dockview, setDockview] = useState<DockviewApi | null>(null);

  // Disable group drags. Cancelling in capture phase beats onWillDragGroup, which fires only after dockview has painted
  // a ghost frame.
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const onDragStart = (event: DragEvent) => {
        if ((event.target as HTMLElement).closest('.dv-void-container')) {
          event.preventDefault();
        }
      };

      container.addEventListener('dragstart', onDragStart, { capture: true });
      return () =>
        container.removeEventListener('dragstart', onDragStart, {
          capture: true,
        });
    }
  }, []);

  useEffect(() => {
    if (dockview) {
      lock(dockview);
      const disposables = [dockview.onDidLayoutChange(() => lock(dockview)), dockview.onWillShowOverlay(preventMerge)];

      return () => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      };
    }
  }, [dockview]);

  const onReady = (event: DockviewReadyEvent) => {
    event.api.addPanel({
      id: 'editor:transport.rs',
      component: 'editor' satisfies PanelKind,
      title: 'transport.rs',
      params: { path: 'transport.rs' },
      minimumWidth: 10,
      minimumHeight: 10,
    });
    event.api.addPanel({
      id: 'fileTree',
      component: 'fileTree' satisfies PanelKind,
      tabComponent: 'fileTree' satisfies PanelKind,
      title: 'Files',
      params: { path: '/' },
      position: { referencePanel: 'editor:transport.rs', direction: 'right' },
      minimumWidth: 10,
      minimumHeight: 10,
      initialWidth: 350,
    });
    event.api.addPanel({
      id: 'term-1',
      component: 'terminal' satisfies PanelKind,
      title: 'zsh 1',
      params: { index: 1 },
      position: { referencePanel: 'editor:transport.rs', direction: 'below' },
      minimumWidth: 10,
      minimumHeight: 10,
      initialHeight: 200,
    });
    setDockview(event.api);

    // TODO: Replace with actual active panel logic
    event.api.getPanel('editor:transport.rs')?.api.setActive();
    onDockviewReady?.(event.api);
  };

  return (
    <div className="flex h-full" ref={containerRef}>
      <div className="min-w-0 flex-1">
        <DockviewReact
          components={panels}
          defaultTabComponent={DefaultTab}
          leftHeaderActionsComponent={AddTabAction}
          onReady={onReady}
          tabComponents={TOOL_TABS}
          theme={THEME}
        />
      </div>
      <ToolStripe dockview={dockview} />
    </div>
  );
}

/**
 * The + after the last tab of every content group.
 */
export function AddTabAction(props: IDockviewHeaderActionsProps) {
  const isToolGroup = props.panels.some((panel) => TOOL_PANELS.has(panel.view.contentComponent));
  if (isToolGroup) {
    return null;
  }

  // TODO: Wire up.
  return (
    <div className="flex h-full items-center px-0.5">
      <Button aria-label="New tab" className="text-text-3" size="icon-xs" variant="ghost">
        <Icon className="size-3.5" name="add" />
      </Button>
    </div>
  );
}

export function DefaultTab(props: IDockviewPanelHeaderProps) {
  // The dock's last remaining content tab is not closable.
  const [closable, setClosable] = useState(true);

  useEffect(() => {
    const recompute = () => {
      const contentPanels = props.containerApi.panels.filter((panel) => !TOOL_PANELS.has(panel.view.contentComponent));
      setClosable(contentPanels.length > 1);
    };

    recompute();
    const disposables = [props.containerApi.onDidAddPanel(recompute), props.containerApi.onDidRemovePanel(recompute)];
    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [props.containerApi]);

  return (
    <div className="group/tab flex h-full items-center gap-1.5 px-2 text-base">
      <span>{props.api.title}</span>
      {closable && (
        <Button
          aria-label={`Close ${props.api.title}`}
          className="size-4 text-text-3 opacity-0 focus-visible:opacity-100 group-hover/tab:opacity-100 in-[.dv-active-tab]:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            props.api.close();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          size="icon-xs"
          variant="ghost"
        >
          <Icon className="size-3" name="close" />
        </Button>
      )}
    </div>
  );
}

/**
 * Tool tabs: icon + title, no close — tools hide via the stripe, not the tab. `data-tool` is the adapter CSS hook for
 * tool-specific state painting.
 */
export function FileTab(props: IDockviewPanelHeaderProps) {
  return (
    <div className="flex h-full items-center gap-1.5 px-2 text-base text-text-2" data-tool>
      <span>{props.api.title}</span>
    </div>
  );
}

export function ToolStripe({ dockview }: { dockview: DockviewApi | null }) {
  const [fileTreeVisible, setFileTreeVisible] = useState(true);

  useEffect(() => {
    // The group api goes stale if the tree ever changes groups; fine while the tool lock pins it in place.
    const group = dockview?.getPanel('fileTree')?.group.api;
    const disposable = group?.onDidVisibilityChange((event) => {
      setFileTreeVisible(event.isVisible);
    });
    return () => disposable?.dispose();
  }, [dockview]);

  const toggleFiles = () => {
    const group = dockview?.getPanel('fileTree')?.group.api;
    if (group) {
      group.setVisible(!group.isVisible);
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

/**
 * Locked panels split but never merge: `locked: true` blocks the header drop surfaces, the overlay veto the rest.
 * Drags recreate groups, so the lock is re-enforced on every mutation.
 */
function lock(api: DockviewApi) {
  for (const panel of api.panels) {
    if (TOOL_PANELS.has(panel.view.contentComponent) && panel.group.api.locked !== true) {
      panel.group.api.locked = true;
    }
  }
}

function preventMerge(event: DockviewWillShowOverlayLocationEvent) {
  const merging =
    event.kind === 'tab' || event.kind === 'header_space' || (event.kind === 'content' && event.position === 'center');
  if (!merging) {
    return;
  }

  // The transfer carries an id, never the panel, so the kind needs a lookup. A group drag has no panel id at all.
  const draggedId = event.getData()?.panelId;
  const dragged = draggedId == null ? undefined : event.api.getPanel(draggedId);
  const draggedTool = dragged != null && TOOL_PANELS.has(dragged.view.contentComponent);
  const targetHasTool =
    event.group != null &&
    event.api.panels.some((panel) => panel.group === event.group && TOOL_PANELS.has(panel.view.contentComponent));

  if (draggedTool || targetHasTool) {
    event.preventDefault();
  }
}

// TODO: Back this with the daemon.
const FAKE_CODE = `pub async fn attach(&self, id: SessionId) -> Result<Channel> {
    let session = self.sessions.get(&id).ok_or(Error::NotFound)?;
    let (tx, rx) = channel::bounded(64);
    session.subscribe(tx).await?;
    Ok(Channel::new(rx))
}`;

function EditorPanel(props: IDockviewPanelProps<{ path: string }>) {
  return <CodeEditor code={FAKE_CODE} path={props.params.path} />;
}

// TODO: Replace with the terminal once it is migrated.
function TerminalPanel(props: IDockviewPanelProps<{ index: number }>) {
  return <p className="p-2 font-mono text-base text-text-3">zsh {props.params.index}</p>;
}

// TODO: Back this with the daemon.
function FileTreePanel(_props: IDockviewPanelProps<{ path: string }>) {
  const paths = [
    'apps/',
    'apps/web/',
    'apps/web/src/',
    'apps/web/src/App.tsx',
    'apps/web/src/main.py',
    'apps/web/src/schema.proto',
    'apps/web/Dockerfile',
    'apps/web/index.html',
    'apps/web/package.json',
    'apps/web/styles.css',
    'daemon/',
    'daemon/src/',
    'daemon/src/envelope.rs',
    'daemon/src/main.rs',
    'daemon/src/scratch.rs',
    'daemon/src/transport.rs',
    'daemon/target/',
    'daemon/target/debug.log',
    'daemon/Cargo.toml',
    'proto/',
    'proto/envelope.proto',
    'Cargo.toml',
    'Makefile',
    'README.md',
  ];

  const expanded = ['daemon/', 'daemon/src/', 'proto/'];

  const selected = ['daemon/src/transport.rs'];

  const statuses = [
    { path: 'daemon/src/main.rs', status: 'modified' },
    { path: 'daemon/src/transport.rs', status: 'added' },
    { path: 'daemon/src/scratch.rs', status: 'untracked' },
    { path: 'daemon/src/envelope.rs', status: 'conflict' },
    { path: 'daemon/target/', status: 'ignored' },
  ] as const;

  // TODO: FolderService.WatchFolders — TYPE_ADD on expand, TYPE_REMOVE on collapse, driven by `model.onExpansion`.
  // Expansion state *is* the subscription table, so this is also what a reconnect replays.
  const model = useFileTree({
    initialPaths: paths,
    initialExpandedPaths: expanded,
    initialSelectedPaths: selected,
    initialGitStatus: statuses,
    // TODO: FolderService.RenameEntry, then let the resulting WatchFolders listing move the row.
    onRename: () => {},
    // TODO: FolderService.RenameEntry again — a move is a rename across folders.
    onDropComplete: () => {},
  });

  // TODO: Pass `gitStatusBadges` from the settings once it exists.
  return <FileTree aria-label="Files in Test Folder" model={model} />;
}
