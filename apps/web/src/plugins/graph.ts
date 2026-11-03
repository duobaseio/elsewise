import type { InstalledPlugin, InvalidPlugin } from '@elsewise/bridge';
import type { Disposable, Manifest, Plugin } from '@elsewise/frontend-plugin';
import { DepGraph, DepGraphCycleError } from 'dependency-graph';
import { satisfies } from 'semver';
import type { ApplicationManager } from '@/application-manager';

export interface Entry {
  plugin: InstalledPlugin | InvalidPlugin;
  state:
    | { readonly status: 'disabled' }
    | { readonly status: 'failed' }
    | { readonly status: 'incompatible'; readonly unsatisfied: Unsatisfied }
    | { readonly status: 'enabled'; readonly running?: EnabledPlugin };
  /** The plugin's queued enable or disable. */
  pending: Promise<void>;
}

export type Unsatisfied =
  | { readonly elsewise: string }
  | { readonly dependency: string; readonly cause: 'missing' | 'incompatible' }
  | { readonly cycle: readonly string[] };

export interface EnabledPlugin {
  readonly plugin: Plugin;
  readonly application: ApplicationManager;
  readonly onEnableDisposables: readonly Disposable[];
  readonly listeners: readonly Disposable[];
}

export function resolve(entries: ReadonlyMap<string, Entry>): {
  graph: DepGraph<undefined>;
  unsatisfied: ReadonlyMap<string, Unsatisfied>;
  modified: boolean;
} {
  const compatible = compatibleGraph(entries);
  const { unsatisfied } = compatible;

  let modified = false;
  for (const [id, entry] of entries) {
    const { state } = entry;
    const reason = unsatisfied.get(id);
    if (reason !== undefined) {
      // A running plugin is disabled through its dependency instead.
      const running = state.status === 'enabled' && state.running !== undefined;
      const same = state.status === 'incompatible' && JSON.stringify(state.unsatisfied) === JSON.stringify(reason);
      if (!running && !same) {
        entry.state = { status: 'incompatible', unsatisfied: reason };
        modified = true;
      }
    } else if (state.status === 'incompatible') {
      entry.state = { status: 'disabled' };
      modified = true;
    }
  }

  return { ...compatible, modified };
}

/**
 * Resolves which plugins can be enabled, dependencies first, and why the others are incompatible.
 */
function compatibleGraph(entries: ReadonlyMap<string, Entry>): {
  graph: DepGraph<undefined>;
  unsatisfied: ReadonlyMap<string, Unsatisfied>;
} {
  const manifests = new Map<string, Manifest>();
  for (const [id, { plugin }] of entries) {
    if (!('error' in plugin)) {
      manifests.set(id, plugin.manifest);
    }
  }

  const version = window.bridge?.version;
  const unsatisfied = new Map<string, Unsatisfied>();
  for (const [id, manifest] of manifests) {
    if (version !== undefined && !satisfies(version, manifest.elsewise)) {
      unsatisfied.set(id, { elsewise: manifest.elsewise });
      continue;
    }

    for (const [dependency, range] of Object.entries(manifest.frontend?.dependencies ?? {})) {
      const plugin = entries.get(dependency)?.plugin;
      if (plugin === undefined) {
        unsatisfied.set(id, { dependency, cause: 'missing' });
        break;
      }
      if ('error' in plugin || !plugin.enabled || !satisfies(plugin.manifest.version, range)) {
        unsatisfied.set(id, { dependency, cause: 'incompatible' });
        break;
      }
    }
  }

  while (true) {
    // A plugin that depends on an incompatible one is incompatible too, however deep.
    let spread = true;
    while (spread) {
      spread = false;
      for (const [id, manifest] of manifests) {
        if (unsatisfied.has(id)) {
          continue;
        }

        const dependency = Object.keys(manifest.frontend?.dependencies ?? {}).find((other) => unsatisfied.has(other));
        if (dependency !== undefined) {
          unsatisfied.set(id, { dependency, cause: 'incompatible' });
          spread = true;
        }
      }
    }

    const graph = new DepGraph<undefined>();
    const ids = [...manifests.keys()].filter((id) => !unsatisfied.has(id)).toSorted((a, b) => a.localeCompare(b));
    for (const id of ids) {
      graph.addNode(id);
    }
    for (const id of ids) {
      for (const dependency of Object.keys(manifests.get(id)?.frontend?.dependencies ?? {})) {
        graph.addDependency(id, dependency);
      }
    }

    try {
      graph.overallOrder();
      return { graph, unsatisfied };
    } catch (error) {
      if (!(error instanceof DepGraphCycleError)) {
        throw error;
      }

      // The path may lead into the cycle before going round it, and ends where the cycle starts.
      const path = error.cyclePath;
      const cycle = path.slice(path.indexOf(path[path.length - 1] as string), -1);
      for (const id of cycle) {
        unsatisfied.set(id, { cycle });
      }
    }
  }
}

/**
 * The valid plugins' frontend dependencies on each other, tolerating cycles and missing plugins.
 */
export function dependencyGraph(entries: ReadonlyMap<string, Entry>): DepGraph<undefined> {
  const graph = new DepGraph<undefined>({ circular: true });
  for (const [id, { plugin }] of entries) {
    if (!('error' in plugin)) {
      graph.addNode(id);
    }
  }
  for (const [id, { plugin }] of entries) {
    if ('error' in plugin) {
      continue;
    }
    for (const dependency of Object.keys(plugin.manifest.frontend?.dependencies ?? {})) {
      if (graph.hasNode(dependency)) {
        graph.addDependency(id, dependency);
      }
    }
  }
  return graph;
}
