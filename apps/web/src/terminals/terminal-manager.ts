import { createDialogHandle } from '@elsewise/components/components/dialog';
import type {
  ContextMenuGroup,
  Disposable,
  TerminalExit,
  TerminalSession,
  TerminalSessionId,
  Terminals,
  TerminalView,
} from '@elsewise/frontend-plugin';
import type { QueryClient } from '@tanstack/react-query';
import { type ITerminalAddon, Terminal as XTerm } from '@xterm/xterm';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { KeyedMap } from '@/collections/keyed-map';
import { MenuManager } from '@/collections/menu-manager';
import { type Daemon, daemonQuery } from '@/daemon';
import { DEFAULT_CONTEXT_MENU } from '@/terminals/context-menu/default-context-menu';
import { SessionStore } from '@/terminals/session-store';
import { TerminalAttachment } from '@/terminals/terminal-attachment';

type AddonFactory = (view: TerminalView) => ITerminalAddon | null;

function keyOf(id: TerminalSessionId): readonly unknown[] {
  return [id.daemon, id.session];
}

interface TerminalEntry {
  readonly id: TerminalSessionId;
  readonly xterm: XTerm;
  readonly addons: Map<AddonFactory, ITerminalAddon | null>;
  shown: boolean;
}

/**
 * The terminals open in this window.
 */
export class TerminalManager implements Terminals {
  readonly store: SessionStore;
  /**
   * Asks whether to close a terminal whose program runs.
   */
  readonly closeDialog = createDialogHandle<TerminalSession>();
  private resolveCloseDialog: ((confirmed: boolean) => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly openListeners = new Set<(view: TerminalView) => void>();
  private readonly closeListeners = new Set<(view: TerminalView) => void>();
  private readonly sessionListeners = new Set<(view: TerminalView) => void>();
  private readonly entries = new KeyedMap<TerminalSessionId, TerminalEntry>(keyOf);
  private readonly opening = new KeyedMap<TerminalSessionId, Promise<TerminalEntry | null>>(keyOf);
  private readonly factories = new Set<AddonFactory>();
  private current: TerminalSessionId | null = null;
  private currentRenaming: TerminalSessionId | null = null;
  private readonly contextMenus = new MenuManager(DEFAULT_CONTEXT_MENU, () => this.notify(), 'Context menu');

  constructor(private readonly client: QueryClient) {
    this.store = new SessionStore(client);
  }

  /**
   * Opens the close dialog for `session`.
   *
   * If the dialog is already open for another terminal, that one is closed unconfirmed first.
   */
  openCloseDialog(session: TerminalSession): Promise<boolean> {
    this.resolveCloseDialog?.(false);
    return new Promise((resolve) => {
      this.resolveCloseDialog = resolve;
      this.closeDialog.openWithPayload(session);
    });
  }

  /**
   * Closes the close dialog, `confirmed` or not. Does nothing if it is not open.
   */
  closeCloseDialog(confirmed: boolean) {
    const resolve = this.resolveCloseDialog;
    if (resolve === null) {
      return;
    }

    this.resolveCloseDialog = null;
    resolve(confirmed);
    this.closeDialog.close();
  }

  get active(): TerminalView | null {
    return this.current === null ? null : this.get(this.current);
  }

  list(): readonly TerminalView[] {
    return [...this.entries.values()].flatMap((entry) => {
      const view = this.view(entry);
      return view === null ? [] : [view];
    });
  }

  get(session: TerminalSessionId): TerminalView | null {
    const entry = this.entries.get(session);
    return entry === undefined ? null : this.view(entry);
  }

  open(id: TerminalSessionId): Promise<TerminalView | null> {
    let opening = this.opening.get(id);
    if (opening === undefined) {
      const pending: Promise<TerminalEntry | null> = this.store.get(id).then(
        (session) => {
          // The terminal was deleted while its session was being fetched.
          if (this.opening.get(id) !== pending) {
            this.store.sessions.delete(id);
            return null;
          }

          if (session === null) {
            this.opening.delete(id);
            return null;
          }

          // Unicode11Addon and LigaturesAddon both reach proposed API.
          const xterm = new XTerm({ allowProposedApi: true });
          const entry: TerminalEntry = { id, xterm, addons: new Map(), shown: false };
          this.entries.set(id, entry);
          const rendered = entry.xterm.onRender(() => {
            rendered.dispose();
            entry.shown = true;
            this.loadAddons(entry);
            void this.attach(entry);
          });

          this.call(this.openListeners, { session, terminal: entry.xterm });
          this.notify();
          return entry;
        },
        (error: unknown) => {
          this.opening.delete(id);
          throw error;
        },
      );
      opening = pending;
      this.opening.set(id, pending);
    }
    return opening.then((entry) => (entry === null ? null : this.view(entry)));
  }

  async rename(id: TerminalSessionId, name: string): Promise<void> {
    const session = await this.store.rename(id, name);
    const entry = this.entries.get(id);
    if (entry !== undefined) {
      this.call(this.sessionListeners, { session, terminal: entry.xterm });
      this.notify();
    }
  }

  async delete(id: TerminalSessionId): Promise<void> {
    const session = this.store.sessions.get(id);
    await this.store.delete(id);

    const entry = this.entries.get(id);
    this.entries.delete(id);
    this.opening.delete(id);
    if (entry !== undefined) {
      entry.xterm.dispose();
      if (session !== undefined) {
        this.call(this.closeListeners, { session, terminal: entry.xterm });
      }
    }
    this.notify();
  }

  private async attach(entry: TerminalEntry) {
    let daemon: Daemon;
    try {
      daemon = await this.client.query(daemonQuery(entry.id.daemon));
    } catch (error) {
      if (this.entries.get(entry.id) === entry) {
        entry.xterm.write(`\x1b[2m${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`);
      }
      return;
    }

    if (this.entries.get(entry.id) !== entry) {
      return;
    }

    entry.xterm.loadAddon(
      new TerminalAttachment(
        daemon.terminals,
        entry.id.session,
        () => this.onStart(entry),
        (exit) => void this.onExit(entry, exit),
      ),
    );
  }

  private onStart(entry: TerminalEntry) {
    const started = this.store.sessions.get(entry.id);
    if (started !== undefined) {
      const session: TerminalSession = { ...started, state: 'running', exit: null };
      this.store.sessions.set(session.id, session);
      this.call(this.sessionListeners, { session, terminal: entry.xterm });
      this.notify();
    }
  }

  private async onExit(entry: TerminalEntry, exit: TerminalExit) {
    const exited = this.store.sessions.get(entry.id);
    if (exited === undefined) {
      return;
    }

    const session: TerminalSession = { ...exited, state: 'exited', exit };
    this.store.sessions.set(session.id, session);
    this.call(this.sessionListeners, { session, terminal: entry.xterm });
    this.notify();

    // Close terminal if login shell, keep program since the output is usually relevant.
    if (session.program === '') {
      await this.delete(session.id).catch((error: unknown) => console.error('Deleting the terminal failed', error));
    }
  }

  addAddons(addons: readonly AddonFactory[]): Disposable {
    for (const factory of addons) {
      this.factories.add(factory);
    }
    for (const entry of this.entries.values()) {
      this.loadAddons(entry);
    }

    return () => {
      for (const factory of addons) {
        this.factories.delete(factory);
        for (const entry of this.entries.values()) {
          entry.addons.get(factory)?.dispose();
          entry.addons.delete(factory);
        }
      }
    };
  }

  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable {
    return this.contextMenus.add(groups);
  }

  /**
   * The context menu's deduplicated groups, in order of first addition.
   */
  get contextMenu(): readonly ContextMenuGroup[] {
    return this.contextMenus.groups;
  }

  /**
   * Makes `session`'s terminal the active terminal.
   */
  activate(session: TerminalSessionId): void {
    if (this.current?.daemon !== session.daemon || this.current.session !== session.session) {
      this.current = session;
      this.notify();
    }
  }

  /**
   * Makes the active terminal null if it is `session`'s.
   */
  deactivate(session: TerminalSessionId): void {
    if (this.current?.daemon === session.daemon && this.current.session === session.session) {
      this.current = null;
      this.notify();
    }
  }

  /**
   * The session whose name is edited in its panel's header.
   */
  get renaming(): TerminalSessionId | null {
    return this.currentRenaming;
  }

  set renaming(renaming: TerminalSessionId | null) {
    this.currentRenaming = renaming;
    this.notify();
  }

  /**
   * Calls `listener` with each terminal that opens.
   */
  onOpen(listener: (view: TerminalView) => void): Disposable {
    this.openListeners.add(listener);
    return () => {
      this.openListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with each terminal that closes.
   */
  onClose(listener: (view: TerminalView) => void): Disposable {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with each terminal whose session changes.
   */
  onSessionChange(listener: (view: TerminalView) => void): Disposable {
    this.sessionListeners.add(listener);
    return () => {
      this.sessionListeners.delete(listener);
    };
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private loadAddons(entry: TerminalEntry) {
    const view = this.view(entry);
    if (!entry.shown || view === null) {
      return;
    }

    for (const factory of this.factories) {
      if (!entry.addons.has(factory)) {
        entry.addons.set(factory, null);
        try {
          const addon = factory(view);
          if (addon !== null) {
            entry.xterm.loadAddon(addon);
            entry.addons.set(factory, addon);
          }
        } catch (error) {
          console.error('Terminal addon failed', error);
        }
      }
    }
  }

  private view(entry: TerminalEntry): TerminalView | null {
    const session = this.store.sessions.get(entry.id);
    return session === undefined ? null : { session, terminal: entry.xterm };
  }

  private call(listeners: Set<(view: TerminalView) => void>, view: TerminalView) {
    for (const listener of listeners) {
      try {
        listener(view);
      } catch (error) {
        console.error('Terminal listener failed', error);
      }
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Terminal listener failed', error);
      }
    }
  }
}

export function useTerminalManager(): TerminalManager;
export function useTerminalManager<T>(select: (terminal: TerminalManager) => T): T;
export function useTerminalManager<T>(select?: (terminal: TerminalManager) => T): TerminalManager | T {
  const terminals = useApplicationManager().terminals;
  const subscribe = useCallback((listener: () => void) => terminals.onChange(listener), [terminals]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? terminals : select(terminals)));
}
