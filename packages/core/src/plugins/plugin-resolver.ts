import type { Disposable, Manifest, PluginInfo } from '@elsewise/plugin';
import { satisfies } from 'semver';
import { dependencyGraph, type Entry, type Part, resolve, type Unsatisfied } from './graph.ts';
import type { InstalledPlugin, InvalidPlugin } from './plugin.ts';

/**
 * A plugin's lifecycle hooks.
 */
export interface Lifecycle<Host> {
  onEnable?(host: Host): Disposable[] | undefined | Promise<Disposable[] | undefined>;
  onDisable?(host: Host): void | Promise<void>;
}

/**
 * A plugin and its status.
 */
export type PluginSnapshot<Enabled = EnabledSnapshot> =
  | { readonly id: string; readonly status: 'invalid'; readonly error: string }
  | { readonly id: string; readonly status: 'disabled' | 'failed'; readonly manifest: Manifest }
  | {
      readonly id: string;
      readonly status: 'incompatible';
      readonly manifest: Manifest;
      readonly unsatisfied: Unsatisfied;
    }
  | Enabled;

/**
 * An enabled plugin.
 */
export interface EnabledSnapshot {
  readonly id: string;
  readonly status: 'enabled';
  readonly manifest: Manifest;
}

interface Running<Host, Plugin> {
  readonly plugin: Plugin;
  readonly host: Host;
  readonly onEnableDisposables: readonly Disposable[];
  readonly attached: readonly Disposable[];
}

const DISPOSE_TIMEOUT = 15_000;

/**
 * Loads, enables and disables the installed plugins.
 *
 * A plugin is enabled after its dependencies and disabled before them. It can't be enabled if a dependency can't be,
 * or if it's in a dependency cycle.
 *
 * Loading a plugin doesn't restart its code.
 */
export abstract class PluginResolver<Installed extends InstalledPlugin, Host, Plugin extends Lifecycle<Host>, Enabled> {
  private static imports = 0;

  private readonly entries = new Map<string, Entry<Installed, Running<Host, Plugin>>>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly PluginSnapshot<Enabled>[] = [];

  /** The plugin part the host runs. */
  protected abstract readonly part: Part;

  /** The host's version. If undefined, every plugin is compatible. */
  protected abstract readonly version: string | undefined;

  get plugins(): readonly PluginSnapshot<Enabled>[] {
    return this.snapshot;
  }

  async loadAll(): Promise<void> {
    const plugins = new Map(
      (await this.installed()).map((plugin) => ['error' in plugin ? plugin.id : plugin.manifest.id, plugin]),
    );

    for (const id of new Set([...this.entries.keys(), ...plugins.keys()])) {
      await this.sync(id, plugins.get(id));
    }
    await this.settle();
  }

  async load(id: string): Promise<void> {
    await this.sync(id, await this.installed(id));
    await this.settle();
  }

  /**
   * Returns the installed plugins, including invalid ones.
   */
  protected abstract installed(): Promise<(Installed | InvalidPlugin)[]>;

  /**
   * Returns the installed plugin with `id`.
   */
  protected abstract installed(id: string): Promise<Installed | InvalidPlugin | undefined>;

  private async settle(): Promise<void> {
    for (const [id, unsatisfied] of resolve(this.entries, { part: this.part, version: this.version }).unsatisfied) {
      const state = this.entries.get(id)?.state;
      if (state?.status === 'enabled' && state.running !== undefined) {
        await this.disable(id, unsatisfied);
      }
    }
    this.publish();
  }

  private async sync(id: string, plugin: Installed | InvalidPlugin | undefined): Promise<void> {
    if (plugin === undefined) {
      // Disables before deleting the entry so that no enable is queued after the disable.
      const disabled = this.disable(id);
      this.entries.delete(id);
      await disabled;
      return;
    }

    if ('error' in plugin) {
      await this.disable(id);
    } else if (plugin.enabled) {
      this.onLoad(id, plugin);
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
   * Called when an enabled plugin is loaded.
   */
  protected onLoad(_id: string, _plugin: Installed): void {}

  /**
   * Enables every plugin flagged as enabled.
   */
  async enableAll(host: Host): Promise<void> {
    const { graph, modified } = resolve(this.entries, { part: this.part, version: this.version });
    if (modified) {
      this.publish();
    }

    for (const [id, { plugin, state }] of this.entries) {
      if (!plugin.enabled) {
        continue;
      }

      if ('error' in plugin) {
        console.error(`Plugin ${id} failed to load: ${plugin.error}`);
      } else if (state.status === 'incompatible') {
        console.error(`Plugin ${id} cannot be enabled: ${this.reason(plugin.manifest, state.unsatisfied)}`);
      }
    }

    for (const id of graph.overallOrder()) {
      if (this.entries.get(id)?.plugin.enabled) {
        await this.start(id, host);
      }
    }
  }

  /**
   * Enables a plugin and its dependencies.
   *
   * Plugins flagged as enabled that depend on it are enabled after it.
   */
  async enable(id: string, host: Host): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined || 'error' in entry.plugin) {
      return;
    }

    const { graph, unsatisfied, modified } = resolve(this.entries, { part: this.part, version: this.version });
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
      await this.start(other, host);
    }
  }

  private async start(id: string, host: Host): Promise<void> {
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

        for (const dependency of Object.keys(plugin.manifest[this.part]?.dependencies ?? {})) {
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
          const module: { default?: (info: PluginInfo) => Plugin } = await import(
            /* @vite-ignore */ `${plugin.url}#${++PluginResolver.imports}`
          );
          if (typeof module.default !== 'function') {
            console.error(`Plugin ${id} failed to load: ${plugin.url} has no default function`);
            entry.state = { status: 'failed' };
            this.publish();
            return;
          }

          const created = module.default({ id });
          const disposables = (await created.onEnable?.(host)) ?? [];
          const attached = this.onEnable(id, created, host);
          entry.state = {
            status: 'enabled',
            running: { plugin: created, host, onEnableDisposables: disposables, attached },
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

  /**
   * Called when a plugin is enabled. The returned disposables run when it is disabled.
   */
  protected abstract onEnable(id: string, plugin: Plugin, host: Host): readonly Disposable[];

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

    const other = this.entries.get(dependency);
    const range = manifest[this.part]?.dependencies?.[dependency] ?? '*';
    if (other === undefined) {
      return `depends on ${dependency}, which is missing`;
    }
    if ('error' in other.plugin) {
      return `depends on ${dependency}, which is invalid`;
    }
    const what = satisfies(other.plugin.manifest.version, range) ? other.state.status : `not within ${range}`;
    return `depends on ${dependency}, which is ${what}`;
  }

  /**
   * Disables every plugin.
   *
   * An enable called right after waits for the plugin to be disabled.
   */
  async disableAll(): Promise<void> {
    const graph = dependencyGraph(this.entries, this.part);
    const order = graph.overallOrder().toReversed();
    const rest = [...this.entries.keys()].filter((id) => !graph.hasNode(id)).toSorted((a, b) => b.localeCompare(a));
    let after = Promise.resolve();
    for (const id of [...order, ...rest]) {
      after = this.stop(id, undefined, after);
    }
    await after;
  }

  /**
   * Disables a plugin and the plugins that depend on it.
   *
   * The plugin is marked incompatible if `unsatisfied` is given.
   */
  async disable(id: string, unsatisfied?: Unsatisfied): Promise<void> {
    if (!this.entries.has(id)) {
      return;
    }

    let after = Promise.resolve();
    const graph = dependencyGraph(this.entries, this.part);
    if (graph.hasNode(id)) {
      const dependants = new Set(graph.dependantsOf(id));
      for (const other of graph.overallOrder().toReversed()) {
        if (!dependants.has(other)) {
          continue;
        }

        const entry = this.entries.get(other);
        if (entry?.plugin.enabled && !('error' in entry.plugin)) {
          const dependency = Object.keys(entry.plugin.manifest[this.part]?.dependencies ?? {}).find(
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
          for (const disposable of running.attached) {
            disposable();
          }
          await this.guard(id, 'disable', () => running.plugin.onDisable?.(running.host));
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
      .map(([id, { plugin, state }]): PluginSnapshot<Enabled> => {
        if ('error' in plugin) {
          return { id, status: 'invalid', error: plugin.error };
        }

        switch (state.status) {
          case 'incompatible':
            return { id, status: state.status, manifest: plugin.manifest, unsatisfied: state.unsatisfied };
          case 'enabled':
            return this.describe(plugin, { id, status: state.status, manifest: plugin.manifest });
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

  /**
   * Returns an enabled plugin's snapshot, with anything the host loaded for it.
   */
  protected abstract describe(plugin: Installed, snapshot: EnabledSnapshot): Enabled;

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
