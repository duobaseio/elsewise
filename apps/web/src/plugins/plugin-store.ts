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
import { satisfies } from 'semver';
import type { ApplicationManager } from '@/application-manager';
import { dependencyGraph, type Entry, resolve, type Unsatisfied } from '@/plugins/graph';

export type Plugin =
  | { readonly id: string; readonly status: 'invalid'; readonly error: string }
  | { readonly id: string; readonly status: 'disabled' | 'failed'; readonly manifest: Manifest }
  | {
      readonly id: string;
      readonly status: 'incompatible';
      readonly manifest: Manifest;
      readonly unsatisfied: Unsatisfied;
    }
  | {
      readonly id: string;
      readonly status: 'enabled';
      readonly manifest: Manifest;
      readonly themes: readonly { readonly id: string; readonly theme: Theme }[];
      readonly keymaps: readonly { readonly id: string; readonly keymap: Keymap }[];
    };

const DISPOSE_TIMEOUT = 15_000;

/**
 * The installed plugins, which it loads from disk, and whose code it enables and disables.
 *
 * A plugin is enabled after the plugins its frontend part depends on, and disabled before them. It cannot be enabled
 * while one of them cannot be, or is in a dependency cycle.
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
    await this.settle();
  }

  async load(id: string): Promise<void> {
    await this.sync(id, await window.bridge?.plugins?.load(id));
    await this.settle();
  }

  // Marks the plugins that cannot be enabled, disabling those that are running, then publishes.
  private async settle(): Promise<void> {
    for (const [id, unsatisfied] of resolve(this.entries).unsatisfied) {
      const state = this.entries.get(id)?.state;
      if (state?.status === 'enabled' && state.running !== undefined) {
        await this.disable(id, unsatisfied);
      }
    }
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
      this.entries.set(id, {
        plugin,
        state: { status: !('error' in plugin) && plugin.enabled ? 'enabled' : 'disabled' },
        pending: Promise.resolve(),
      });
    } else {
      entry.plugin = plugin;
    }
  }

  /**
   * Enables every plugin that is flagged enabled, each after the plugins it depends on, and logs the invalid and
   * incompatible ones.
   */
  async enableAll(application: ApplicationManager): Promise<void> {
    const { graph, modified } = resolve(this.entries);
    if (modified) {
      this.publish();
    }

    for (const state of this.snapshot) {
      if (!this.entries.get(state.id)?.plugin.enabled) {
        continue;
      }

      if (state.status === 'invalid') {
        console.error(`Plugin ${state.id} failed to load: ${state.error}`);
      } else if (state.status === 'incompatible') {
        console.error(`Plugin ${state.id} cannot be enabled: ${this.reason(state.manifest, state.unsatisfied)}`);
      }
    }

    for (const id of graph.overallOrder()) {
      if (this.entries.get(id)?.plugin.enabled) {
        await this.start(id, application);
      }
    }
  }

  /**
   * Enables the plugin with `id` in `application`, after the plugins it depends on and before the flagged plugins
   * waiting on it, importing each one's code first.
   *
   * Does nothing if the plugin is invalid, incompatible, not installed or already enabled.
   */
  async enable(id: string, application: ApplicationManager): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined || 'error' in entry.plugin) {
      return;
    }

    const { graph, unsatisfied, modified } = resolve(this.entries);
    if (modified) {
      this.publish();
    }

    const reason = unsatisfied.get(id);
    if (reason !== undefined) {
      console.error(`Plugin ${id} cannot be enabled: ${this.reason(entry.plugin.manifest, reason)}`);
      return;
    }

    const waiting = graph
      .dependantsOf(id)
      .filter((other) => this.entries.get(other)?.plugin.enabled)
      .toReversed();

    for (const other of [...graph.dependenciesOf(id), id, ...waiting]) {
      await this.start(other, application);
    }
  }

  private async start(id: string, application: ApplicationManager): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      return;
    }

    entry.pending = entry.pending
      .then(async () => {
        const { plugin } = entry;
        if (
          'error' in plugin ||
          entry.state.status === 'incompatible' ||
          (entry.state.status === 'enabled' && entry.state.running !== undefined)
        ) {
          return;
        }

        for (const dependency of Object.keys(plugin.manifest.frontend?.dependencies ?? {})) {
          await this.entries.get(dependency)?.pending;
          // Looked up again as dependency may have been uninstalled.
          const other = this.entries.get(dependency);

          if (other === undefined || 'error' in other.plugin || other.state.status !== 'enabled') {
            const unsatisfied = { dependency, cause: other === undefined ? 'missing' : 'incompatible' } as const;
            entry.state = { status: 'incompatible', unsatisfied };
            console.error(`Plugin ${id} cannot be enabled: ${this.reason(plugin.manifest, unsatisfied)}`);
            this.publish();
            return;
          }
        }

        if (entry.state.status !== 'enabled') {
          entry.state = { status: 'enabled' };
          this.publish();
        }

        if (plugin.url === undefined) {
          return;
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
            entry.state = { status: 'failed' };
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

          entry.state = {
            status: 'enabled',
            running: { plugin: created, application, onEnableDisposables: disposables, listeners },
          };
        } catch (error) {
          console.error(`Plugin ${id} failed to enable`, error);
          entry.state = { status: 'failed' };
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

  private reason(manifest: Manifest, unsatisfied: Unsatisfied): string {
    if ('elsewise' in unsatisfied) {
      return `needs Elsewise ${unsatisfied.elsewise}`;
    }

    if ('cycle' in unsatisfied) {
      const others = unsatisfied.cycle.filter((id) => id !== manifest.id);
      return others.length === 0 ? 'depends on itself' : `is in a dependency cycle with ${others.join(', ')}`;
    }

    const { dependency, cause } = unsatisfied;
    if (cause === 'missing') {
      return `depends on ${dependency}, which is not installed`;
    }

    // Its status says why, unless it is the wrong version.
    const other = this.snapshot.find((plugin) => plugin.id === dependency);
    const range = manifest.frontend?.dependencies?.[dependency] ?? '*';
    const what =
      other !== undefined && 'manifest' in other && !satisfies(other.manifest.version, range)
        ? `not within ${range}`
        : (other?.status ?? 'missing');
    return `depends on ${dependency}, which is ${what}`;
  }

  /**
   * Disables every plugin, queuing each disable, each before the plugins it depends on, before returning.
   *
   * An enable called right after then runs after the disable, e.g. when a remounted root enables the plugins again.
   */
  async disableAll(): Promise<void> {
    const graph = dependencyGraph(this.entries);
    const order = graph.overallOrder().toReversed();
    const rest = [...this.entries.keys()].filter((id) => !graph.hasNode(id)).toSorted((a, b) => b.localeCompare(a));
    let after = Promise.resolve();
    for (const id of [...order, ...rest]) {
      after = this.stop(id, undefined, after);
    }
    await after;
  }

  /**
   * Disables the plugin with `id`, after the plugins that depend on it, which then wait on it. Leaves the plugin
   * incompatible for `unsatisfied`, if given.
   *
   * Queues every disable before returning, so a caller may drop the plugin right after, and waits for each plugin's
   * pending enable or disable first.
   */
  async disable(id: string, unsatisfied?: Unsatisfied): Promise<void> {
    if (!this.entries.has(id)) {
      return;
    }

    let after = Promise.resolve();
    const graph = dependencyGraph(this.entries);
    if (graph.hasNode(id)) {
      const dependants = new Set(graph.dependantsOf(id));
      for (const other of graph.overallOrder().toReversed()) {
        if (!dependants.has(other)) {
          continue;
        }

        const entry = this.entries.get(other);
        if (entry?.plugin.enabled && !('error' in entry.plugin)) {
          // Through the dependency that leads to `id`, which may be `id` itself.
          const dependency = Object.keys(entry.plugin.manifest.frontend?.dependencies ?? {}).find(
            (candidate) => candidate === id || dependants.has(candidate),
          );
          after = this.stop(other, { dependency: dependency ?? id, cause: 'incompatible' }, after);
        } else {
          after = this.stop(other, undefined, after);
        }
      }
    }
    await this.stop(id, unsatisfied, after);
  }

  // Disables the plugin with `id`, after its pending enable or disable and `after`, leaving it incompatible for
  // `unsatisfied`. Queues the disable before returning.
  private stop(id: string, unsatisfied?: Unsatisfied, after: Promise<void> = Promise.resolve()): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      return after;
    }

    entry.pending = Promise.all([entry.pending, after])
      .then(async () => {
        const { state } = entry;
        if (state.status === 'enabled' && state.running !== undefined) {
          const { running } = state;
          entry.state = { status: 'enabled' };
          for (const listener of running.listeners) {
            listener();
          }
          await this.guard(id, 'disable', () => running.plugin.onDisable?.(running.application));
          for (const disposable of running.onEnableDisposables.toReversed()) {
            await this.guard(id, 'dispose', disposable);
          }
        }

        if ('error' in entry.plugin) {
          return;
        }
        if (unsatisfied !== undefined) {
          entry.state = { status: 'incompatible', unsatisfied };
          this.publish();
        } else if (entry.state.status !== 'disabled' && entry.state.status !== 'incompatible') {
          entry.state = { status: 'disabled' };
          this.publish();
        }
      })
      .catch((error: unknown) => console.error(`Plugin ${id} failed`, error));
    return entry.pending;
  }

  private publish() {
    this.snapshot = [...this.entries]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([id, { plugin, state }]): Plugin => {
        if ('error' in plugin) {
          return { id, status: 'invalid', error: plugin.error };
        }

        switch (state.status) {
          case 'incompatible':
            return { id, status: state.status, manifest: plugin.manifest, unsatisfied: state.unsatisfied };
          case 'enabled':
            return {
              id,
              status: state.status,
              manifest: plugin.manifest,
              themes: plugin.themes.flatMap((theme) => ('error' in theme ? [] : [theme])),
              keymaps: plugin.keymaps.flatMap((keymap) => ('error' in keymap ? [] : [keymap])),
            };
          default:
            return { id, status: state.status, manifest: plugin.manifest };
        }
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
