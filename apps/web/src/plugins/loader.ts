import type { InstalledPlugin } from '@elsewise/bridge';
import type { Appearance, Plugin, PluginContext } from '@elsewise/plugin';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';

/**
 * Every installed plugin.
 */
export const pluginsQuery = queryOptions({
  queryKey: ['plugins'],
  queryFn: async (): Promise<readonly InstalledPlugin[]> => (await window.bridge?.plugins?.load()) ?? [],
  staleTime: 'static',
  gcTime: Number.POSITIVE_INFINITY,
});

/**
 * Returns what `select` picks from the installed plugins.
 */
export function usePlugins<T>(select: (plugins: readonly InstalledPlugin[]) => T): T {
  return useSuspenseQuery({ ...pluginsQuery, select }).data;
}

/**
 * Loads and unloads plugins, and holds the loaded ones.
 */
export class PluginLoader {
  private static imports = 0;

  private readonly plugins = new Map<string, Promise<PluginContext | undefined>>();

  /**
   * Creates a loader that provides `appearance` to the plugins it enables.
   */
  public constructor(private readonly appearance: Appearance) {}

  /**
   * Loads and enables the plugin with `id`.
   */
  public load(id: string, url: string): Promise<void> {
    return this.enqueue(id, async (loaded) => {
      if (loaded) {
        return loaded;
      }

      const context: PluginContext = { id, subscriptions: [], appearance: this.appearance };
      try {
        // As modules are cached by URLs, using a counter makes a reload import the plugin's current code.
        // Unlike a query, a fragment never reaches the server.
        //
        // This technically leaks memory but there isn't a way to manually free stale modules. Vite dev server does
        // the same thing so it should be fine.
        const plugin: Partial<Plugin> = await import(/* @vite-ignore */ `${url}#${++PluginLoader.imports}`);
        if (typeof plugin.enable !== 'function') {
          console.error(`Plugin ${id} failed to load: ${url} has no 'enable' function`);
          return;
        }

        await plugin.enable(context);
        return context;
      } catch (error) {
        console.error(`Plugin ${id} failed to load`, error);
        this.dispose(context);
      }
    });
  }

  /**
   * Unloads the plugin with `id` and disposes its subscriptions.
   *
   * Waits for the plugin's pending load or unload first, and does nothing if it's then unloaded.
   */
  public unload(id: string): Promise<void> {
    return this.enqueue(id, async (loaded) => {
      if (loaded) {
        this.dispose(loaded);
      }
    });
  }

  private async enqueue(
    id: string,
    operation: (loaded: PluginContext | undefined) => Promise<PluginContext | undefined>,
  ) {
    const next = (this.plugins.get(id) ?? Promise.resolve(undefined)).then(operation);
    this.plugins.set(id, next);
    await next;
  }

  private dispose(context: PluginContext) {
    for (const disposable of context.subscriptions.toReversed()) {
      try {
        disposable();
      } catch (error) {
        console.error(`Plugin ${context.id} failed to dispose`, error);
      }
    }
  }
}
