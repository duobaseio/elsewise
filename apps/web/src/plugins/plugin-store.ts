import type { InstalledPlugin, InvalidPlugin } from '@elsewise/bridge';
import type {
  Disposable,
  Keymap,
  Manifest,
  Plugin as PluginImplementation,
  PluginInfo,
  Theme,
} from '@elsewise/frontend-plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { ApplicationManager } from '@/application-manager';

export type Plugin =
  | { readonly id: string; readonly status: 'invalid'; readonly error: string }
  | { readonly id: string; readonly status: 'disabled' | 'failed'; readonly manifest: Manifest }
  | {
      readonly id: string;
      readonly status: 'enabled';
      readonly manifest: Manifest;
      readonly themes: readonly { readonly id: string; readonly theme: Theme }[];
      readonly keymaps: readonly { readonly id: string; readonly keymap: Keymap }[];
    };

/**
 * How long a plugin's `onDisable` or a disposable may take before it is skipped, in milliseconds.
 */
const DISPOSE_TIMEOUT = 15_000;

interface Entry {
  plugin: InstalledPlugin | InvalidPlugin;
  /** The status of a valid plugin. */
  status: Exclude<Plugin['status'], 'invalid'>;
  /** The plugin's running code, while enabled. */
  enabled?: EnabledPlugin;
  /** The plugin's queued enable or disable. */
  pending: Promise<void>;
}

interface EnabledPlugin {
  readonly plugin: PluginImplementation;
  /** The application the plugin was enabled with. */
  readonly application: ApplicationManager;
  readonly onEnableDisposables: readonly Disposable[];
  /** The subscriptions that call the plugin's handlers. */
  readonly listeners: readonly Disposable[];
}

/**
 * The installed plugins, which it loads from disk, and whose code it enables and disables.
 *
 * Loading replaces a plugin's data and leaves whether its code runs alone, so reloading a plugin is a disable, a load
 * and an enable.
 */
export class PluginStore {
  private static imports = 0;

  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly Plugin[] = [];

  get plugins(): readonly Plugin[] {
    return this.snapshot;
  }

  async loadAll(): Promise<void> {
    const plugins = new Map(
      ((await window.bridge?.plugins?.load()) ?? []).map((plugin) => [
        'error' in plugin ? plugin.id : plugin.manifest.id,
        plugin,
      ]),
    );

    for (const id of new Set([...this.entries.keys(), ...plugins.keys()])) {
      await this.sync(id, plugins.get(id));
    }
    this.publish();
  }

  async load(id: string): Promise<void> {
    await this.sync(id, await window.bridge?.plugins?.load(id));
    this.publish();
  }

  private async sync(id: string, plugin: InstalledPlugin | InvalidPlugin | undefined): Promise<void> {
    if (plugin === undefined) {
      // Queues the teardown before dropping the entry, so no enable can queue after it.
      const disabled = this.disable(id);
      this.entries.delete(id);
      await disabled;
      return;
    }

    if ('error' in plugin) {
      await this.disable(id);
    }

    if (!('error' in plugin) && plugin.enabled) {
      for (const theme of plugin.themes) {
        if ('error' in theme) {
          console.error(`Plugin ${id}'s theme ${theme.id} failed to load: ${theme.error}`);
        }
      }

      for (const keymap of plugin.keymaps) {
        if ('error' in keymap) {
          console.error(`Plugin ${id}'s keymap ${keymap.id} failed to load: ${keymap.error}`);
        }
      }
    }

    const entry = this.entries.get(id);
    if (entry === undefined) {
      this.entries.set(id, { plugin, status: plugin.enabled ? 'enabled' : 'disabled', pending: Promise.resolve() });
    } else {
      entry.plugin = plugin;
    }
  }

  /**
   * Enables every plugin that is flagged enabled, in id order, and logs the invalid ones.
   */
  async enableAll(application: ApplicationManager): Promise<void> {
    for (const state of this.snapshot) {
      if (!this.entries.get(state.id)?.plugin.enabled) {
        continue;
      }

      if (state.status === 'invalid') {
        console.error(`Plugin ${state.id} failed to load: ${state.error}`);
        continue;
      }

      // TODO: Skip a plugin without a main module, once plugins without code are decided.
      await this.enable(state.id, application);
    }
  }

  /**
   * Enables the plugin with `id` in `application`, importing its code first.
   *
   * Does nothing if the plugin is invalid, not installed or already enabled.
   */
  async enable(id: string, application: ApplicationManager): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      return;
    }

    entry.pending = entry.pending
      .then(async () => {
        const { plugin } = entry;
        if (entry.enabled || 'error' in plugin) {
          return;
        }

        if (entry.status !== 'enabled') {
          entry.status = 'enabled';
          this.publish();
        }
        try {
          // As modules are cached by URLs, using a counter makes a reload import the plugin's current code.
          // Unlike a query, a fragment never reaches the server.
          //
          // This technically leaks memory but there isn't a way to manually free stale modules. Vite dev server does
          // the same thing so it should be fine.
          const module: { default?: (info: PluginInfo) => PluginImplementation } = await import(
            /* @vite-ignore */ `${plugin.url}#${++PluginStore.imports}`
          );
          if (typeof module.default !== 'function') {
            console.error(`Plugin ${id} failed to load: ${plugin.url} has no default function`);
            entry.status = 'failed';
            this.publish();
            return;
          }

          const created = module.default({ id });
          const disposables = (await created.onEnable?.(application)) ?? [];

          const listeners: Disposable[] = [];
          if (created.onBrightnessChange) {
            listeners.push(
              application.appearance.onBrightnessChange((brightness) =>
                this.call(id, 'onBrightnessChange', () => created.onBrightnessChange?.(brightness)),
              ),
            );
          }
          if (created.onThemeChange) {
            listeners.push(
              application.appearance.onThemeChange((theme) =>
                this.call(id, 'onThemeChange', () => created.onThemeChange?.(theme)),
              ),
            );
          }
          if (created.onKeymapChange) {
            listeners.push(
              application.commands.onKeymapChange((keymap) =>
                this.call(id, 'onKeymapChange', () => created.onKeymapChange?.(keymap)),
              ),
            );
          }

          entry.enabled = { plugin: created, application, onEnableDisposables: disposables, listeners };
        } catch (error) {
          console.error(`Plugin ${id} failed to enable`, error);
          entry.status = 'failed';
          this.publish();
        }
      })
      .catch((error: unknown) => console.error(`Plugin ${id} failed`, error));
    await entry.pending;
  }

  private call(id: string, what: string, handler: () => unknown) {
    try {
      const result = handler();
      if (result instanceof Promise) {
        result.catch((error: unknown) => console.error(`Plugin ${id} failed to handle ${what}`, error));
      }
    } catch (error) {
      console.error(`Plugin ${id} failed to handle ${what}`, error);
    }
  }

  /**
   * Disables every plugin, queuing each disable, in reverse id order, before returning.
   *
   * An enable called right after then runs after the disable, e.g. when a remounted root enables the plugins again.
   */
  async disableAll(): Promise<void> {
    await Promise.all(this.snapshot.toReversed().map(({ id }) => this.disable(id)));
  }

  /**
   * Disables the plugin with `id`.
   *
   * Waits for the plugin's pending enable or disable first.
   */
  async disable(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      return;
    }

    entry.pending = entry.pending
      .then(async () => {
        const { enabled } = entry;
        if (enabled) {
          entry.enabled = undefined;
          for (const listener of enabled.listeners) {
            listener();
          }
          await this.guard(id, 'disable', () => enabled.plugin.onDisable?.(enabled.application));
          for (const disposable of enabled.onEnableDisposables.toReversed()) {
            await this.guard(id, 'dispose', disposable);
          }
        }

        if (!('error' in entry.plugin) && entry.status !== 'disabled') {
          entry.status = 'disabled';
          this.publish();
        }
      })
      .catch((error: unknown) => console.error(`Plugin ${id} failed`, error));
    await entry.pending;
  }

  // Rebuilds the snapshot in id order and notifies the listeners.
  private publish() {
    this.snapshot = [...this.entries]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([id, { plugin, status }]): Plugin => {
        if ('error' in plugin) {
          return { id, status: 'invalid', error: plugin.error };
        }
        if (status === 'enabled') {
          return {
            id,
            status,
            manifest: plugin.manifest,
            themes: plugin.themes.flatMap((theme) => ('error' in theme ? [] : [theme])),
            keymaps: plugin.keymaps.flatMap((keymap) => ('error' in keymap ? [] : [keymap])),
          };
        }
        return { id, status, manifest: plugin.manifest };
      });

    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Plugins listener failed', error);
      }
    }
  }

  private async guard(id: string, what: string, run: () => void | Promise<void>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Took longer than ${DISPOSE_TIMEOUT}ms`)), DISPOSE_TIMEOUT);
        }),
      ]);
    } catch (error) {
      console.error(`Plugin ${id} failed to ${what}`, error);
    } finally {
      clearTimeout(timer);
    }
  }

  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const PluginStoreContext = createContext<PluginStore | null>(null);

export function usePluginStore(): PluginStore;
export function usePluginStore<T>(select: (plugins: PluginStore) => T): T;
export function usePluginStore<T>(select?: (plugins: PluginStore) => T): PluginStore | T {
  const plugins = useContext(PluginStoreContext);
  if (plugins === null) {
    throw new Error('Missing PluginStoreContext');
  }

  const subscribe = useCallback((listener: () => void) => plugins.subscribe(listener), [plugins]);
  const snapshot = () => (select === undefined ? plugins : select(plugins));
  // A server render, as in the hooks' Node tests, reads the same snapshot.
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
