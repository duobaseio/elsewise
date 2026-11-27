import {
  type ContextMenuGroup,
  type CustomPanelSource,
  DEFAULT_PANEL_MENU,
  DEFAULT_PANEL_SOURCES,
  type Disposable,
  type Dock,
  type Docks,
  type Panel,
  type PanelMenuGroup,
  type PanelMenuItem,
  type PanelMenuSubmenuItem,
  type WorkspaceId,
} from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { MenuManager } from '@/collections/menu-manager';
import { sameWorkspace } from '@/projects/workspace-manager';
import { DEFAULT_CONTEXT_MENU } from './default-context-menu';
import { DockManager } from './dock-manager';
import type { PanelComponent } from './panel-component';

const DEFAULT_PANEL_MENU_GROUPS: readonly PanelMenuGroup[] = [
  {
    id: DEFAULT_PANEL_MENU.terminals.id,
    order: DEFAULT_PANEL_MENU.terminals.order,
    items: [{ order: DEFAULT_PANEL_MENU.terminals.items.terminal, source: DEFAULT_PANEL_SOURCES.terminal }],
  },
];

/**
 * The docks, of which only the shown workspace's exists.
 */
export class DocksManager implements Docks {
  active: DockManager | null = null;
  private readonly openListeners = new Set<(dock: Dock, panel: Panel) => void>();
  private readonly closeListeners = new Set<(dock: Dock, panel: Panel) => void>();
  private readonly changeListeners = new Set<(dock: Dock | null) => void>();
  private readonly sourceListeners = new Set<() => void>();
  private currentSources: readonly CustomPanelSource[] = [];
  private pendingPanelSources = true;
  private readonly menuListeners = new Set<() => void>();
  private readonly menu = new MenuManager<PanelMenuItem | PanelMenuSubmenuItem>(
    DEFAULT_PANEL_MENU_GROUPS,
    () => this.call(this.menuListeners),
    'Panel menu',
  );
  private readonly contextMenuListeners = new Set<() => void>();
  private readonly contextMenus = new MenuManager(
    DEFAULT_CONTEXT_MENU,
    () => this.call(this.contextMenuListeners),
    'Context menu',
  );
  private attached: DockManager | null = null;
  private addedComponents: readonly (readonly PanelComponent[])[] = [];
  private currentComponents: readonly PanelComponent[] = [];
  private readonly focusListeners = new Set<() => void>();
  private currentFocusRequest: { readonly panel: string; readonly monotonic: number } | null = null;

  constructor(private readonly application: ApplicationManager) {
    application.projects.workspaces.onActiveChange(() => this.update());
  }

  /**
   * The panel components, in order of addition.
   */
  get panelComponents(): readonly PanelComponent[] {
    return this.currentComponents;
  }

  addPanelComponents(components: readonly PanelComponent[]): Disposable {
    const added = [...components];
    this.addedComponents = [...this.addedComponents, added];
    this.currentComponents = this.addedComponents.flat();
    return () => {
      this.addedComponents = this.addedComponents.filter((other) => other !== added);
      this.currentComponents = this.addedComponents.flat();
    };
  }

  /**
   * The sources of custom panels, in order of addition.
   */
  get panelSources(): readonly CustomPanelSource[] {
    return this.currentSources;
  }

  addPanelSources(sources: readonly CustomPanelSource[]): Disposable {
    const added: CustomPanelSource[] = [];
    for (const source of sources) {
      if (!source.id.includes('/')) {
        console.warn(`Panel source ${source.id} is not namespaced`);
      } else if ([...this.currentSources, ...added].some((other) => other.id === source.id)) {
        console.warn(`Panel source ${source.id} already exists`);
      } else {
        added.push(source);
      }
    }

    this.currentSources = [...this.currentSources, ...added];
    this.call(this.sourceListeners);
    return () => {
      this.currentSources = this.currentSources.filter((source) => !added.includes(source));
      this.attached?.closeCustomPanels(added.map((source) => source.id));
      this.call(this.sourceListeners);
    };
  }

  /**
   * The panel menu's groups, one per id, in order of first addition.
   */
  get panelMenu(): readonly PanelMenuGroup[] {
    return this.menu.groups;
  }

  addPanelMenu(groups: readonly PanelMenuGroup[]): Disposable {
    return this.menu.add(groups);
  }

  /**
   * The context menu's groups, one per id, in order of first addition.
   */
  get contextMenu(): readonly ContextMenuGroup[] {
    return this.contextMenus.groups;
  }

  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable {
    return this.contextMenus.add(groups);
  }

  /**
   * The panel that was last asked to take the focus, with a count that tells one request from the next.
   */
  get focusRequest(): { readonly panel: string; readonly monotonic: number } | null {
    return this.currentFocusRequest;
  }

  /**
   * Asks the panel with `id` to take the focus.
   */
  requestPanelFocus(id: string) {
    this.currentFocusRequest = { panel: id, monotonic: (this.currentFocusRequest?.monotonic ?? 0) + 1 };
    this.call(this.focusListeners);
  }

  /**
   * Attaches the dockview that shows `workspace`.
   *
   * Returns its dock, which is not active until the workspace is.
   */
  attach(workspace: WorkspaceId, view: DockviewApi): DockManager {
    this.attached?.dispose();
    const dock = new DockManager(
      workspace,
      view,
      this.application,
      (panel) => {
        if (this.active === dock) {
          this.call(this.openListeners, dock, panel);
        }
      },
      (panel) => {
        if (this.active === dock) {
          this.call(this.closeListeners, dock, panel);
        }
      },
      () => {
        if (this.active === dock) {
          this.call(this.changeListeners, dock);
        }
      },
    );
    this.attached = dock;
    if (!this.pendingPanelSources) {
      dock.closeSourcelessPanels();
    }
    if (dock.activePanel !== null) {
      this.requestPanelFocus(dock.activePanel.id);
    }
    this.update();
    return dock;
  }

  detach(dock: DockManager) {
    dock.dispose();
    if (this.attached === dock) {
      this.attached = null;
      this.update();
    }
  }

  // There is a slight gap between when the dock manager is attached and workspaces.active is updated.
  private update() {
    const dock = sameWorkspace(this.application.projects.workspaces.active?.id, this.attached?.workspaceId)
      ? this.attached
      : null;
    if (this.active !== dock) {
      this.active = dock;
      this.call(this.changeListeners, dock);
    }
  }

  private call<T extends unknown[]>(listeners: Set<(...parameters: T) => void>, ...parameters: T) {
    for (const listener of listeners) {
      try {
        listener(...parameters);
      } catch (error) {
        console.error('Dock listener failed', error);
      }
    }
  }

  /**
   * Closes the custom panels with unknown sources. Should be called after all sources are initially loaded.
   */
  closeSourcelessPanels() {
    this.pendingPanelSources = false;
    this.attached?.closeSourcelessPanels();
  }

  /**
   * Calls `listener` when a source of custom panels is added or removed.
   */
  onPanelSourcesChange(listener: () => void): Disposable {
    this.sourceListeners.add(listener);
    return () => {
      this.sourceListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` when the panel menu's groups change.
   */
  onPanelMenuChange(listener: () => void): Disposable {
    this.menuListeners.add(listener);
    return () => {
      this.menuListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` when the context menu's groups change.
   */
  onContextMenuChange(listener: () => void): Disposable {
    this.contextMenuListeners.add(listener);
    return () => {
      this.contextMenuListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` when a panel is asked to take the focus.
   */
  onFocusRequestChange(listener: () => void): Disposable {
    this.focusListeners.add(listener);
    return () => {
      this.focusListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with each panel that opens, and its dock.
   */
  onPanelOpen(listener: (dock: Dock, panel: Panel) => void): Disposable {
    this.openListeners.add(listener);
    return () => {
      this.openListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with each panel that closes, and its dock.
   */
  onPanelClose(listener: (dock: Dock, panel: Panel) => void): Disposable {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with the active dock when another becomes active or it changes.
   */
  onChange(listener: (dock: Dock | null) => void): Disposable {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }
}

export function usePanelSources(): readonly CustomPanelSource[] {
  const { docks } = useApplicationManager();
  const subscribe = useCallback((listener: () => void) => docks.onPanelSourcesChange(listener), [docks]);
  return useSyncExternalStore(subscribe, () => docks.panelSources);
}

export function usePanelMenu(): readonly PanelMenuGroup[] {
  const { docks } = useApplicationManager();
  const subscribe = useCallback((listener: () => void) => docks.onPanelMenuChange(listener), [docks]);
  return useSyncExternalStore(subscribe, () => docks.panelMenu);
}

export function useDockContextMenu(): readonly ContextMenuGroup[] {
  const { docks } = useApplicationManager();
  const subscribe = useCallback((listener: () => void) => docks.onContextMenuChange(listener), [docks]);
  return useSyncExternalStore(subscribe, () => docks.contextMenu);
}

export function useFocusRequest(): DocksManager['focusRequest'] {
  const { docks } = useApplicationManager();
  const subscribe = useCallback((listener: () => void) => docks.onFocusRequestChange(listener), [docks]);
  return useSyncExternalStore(subscribe, () => docks.focusRequest);
}
