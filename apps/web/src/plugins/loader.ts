import type { InstalledPlugin, InvalidPlugin } from '@elsewise/bridge';
import type { Disposable, Plugin, PluginInfo } from '@elsewise/plugin';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import type { AppearanceManager } from '@/appearance/appearance-manager';
import type { CommandManager } from '@/command/command-manager';

/**
 * Every installed plugin, and every invalid one.
 */
export const pluginsQuery = queryOptions({
  queryKey: ['plugins'],
  queryFn: async (): Promise<readonly (InstalledPlugin | InvalidPlugin)[]> =>
    (await window.bridge?.plugins?.load()) ?? [],
  staleTime: 'static',
  gcTime: Number.POSITIVE_INFINITY,
});

/**
 * Returns the installed plugins.
 */
export function usePlugins(): readonly (InstalledPlugin | InvalidPlugin)[];
export function usePlugins<T>(select: (plugins: readonly (InstalledPlugin | InvalidPlugin)[]) => T): T;
export function usePlugins<T>(
  select?: (plugins: readonly (InstalledPlugin | InvalidPlugin)[]) => T,
): readonly (InstalledPlugin | InvalidPlugin)[] | T {
  return useSuspenseQuery({ ...pluginsQuery, select }).data;
}

/**
 * How long a plugin's `onDisable` or a disposable may take before it is skipped, in milliseconds.
 */
const DISPOSE_TIMEOUT = 15_000;

interface LoadedPlugin {
  readonly plugin: Plugin;
  readonly onEnableDisposables: readonly Disposable[];
  /** The subscriptions that call the plugin's handlers. */
  readonly listeners: readonly Disposable[];
}

export class PluginLoader {
  private static imports = 0;

  private readonly plugins = new Map<string, Promise<LoadedPlugin | undefined>>();

  constructor(
    private readonly appearance: AppearanceManager,
    private readonly commands: CommandManager,
  ) {}

  /**
   * Loads and enables the plugin with `id`.
   */
  load(id: string, url: string): Promise<void> {
    return this.enqueue(id, async (loaded) => {
      if (loaded) {
        return loaded;
      }

      try {
        // As modules are cached by URLs, using a counter makes a reload import the plugin's current code.
        // Unlike a query, a fragment never reaches the server.
        //
        // This technically leaks memory but there isn't a way to manually free stale modules. Vite dev server does
        // the same thing so it should be fine.
        const module: { default?: (info: PluginInfo) => Plugin } = await import(
          /* @vite-ignore */ `${url}#${++PluginLoader.imports}`
        );
        if (typeof module.default !== 'function') {
          console.error(`Plugin ${id} failed to load: ${url} has no default function`);
          return;
        }

        const plugin = module.default({ id });
        const disposables = (await plugin.onEnable?.(this.commands.application)) ?? [];

        const listeners: Disposable[] = [];
        if (plugin.onBrightnessChange) {
          listeners.push(
            this.appearance.onBrightnessChange((brightness) =>
              this.call(id, 'onBrightnessChange', () => plugin.onBrightnessChange?.(brightness)),
            ),
          );
        }
        if (plugin.onThemeChange) {
          listeners.push(
            this.appearance.onThemeChange((theme) =>
              this.call(id, 'onThemeChange', () => plugin.onThemeChange?.(theme)),
            ),
          );
        }
        if (plugin.onKeymapChange) {
          listeners.push(
            this.commands.onKeymapChange((keymap) =>
              this.call(id, 'onKeymapChange', () => plugin.onKeymapChange?.(keymap)),
            ),
          );
        }

        return { plugin, onEnableDisposables: disposables, listeners };
      } catch (error) {
        console.error(`Plugin ${id} failed to load`, error);
        return;
      }
    });
  }

  /**
   * Disables and unloads the plugin with `id`.
   *
   * Waits for the plugin's pending load or unload first, and does nothing if it is then unloaded.
   */
  unload(id: string): Promise<void> {
    return this.enqueue(id, async (loaded) => {
      if (!loaded) {
        return;
      }

      for (const listener of loaded.listeners) {
        listener();
      }
      if (loaded.plugin.onDisable) {
        await this.guard(id, 'disable', () => loaded.plugin.onDisable?.(this.commands.application));
      }
      await this.dispose(id, loaded.onEnableDisposables);
    });
  }

  private async enqueue(
    id: string,
    operation: (loaded: LoadedPlugin | undefined) => Promise<LoadedPlugin | undefined>,
  ) {
    const next = (this.plugins.get(id) ?? Promise.resolve(undefined)).then(operation).catch((error: unknown) => {
      console.error(`Plugin ${id} failed`, error);
      return undefined;
    });
    this.plugins.set(id, next);
    await next;
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

  private async dispose(id: string, disposables: readonly Disposable[]) {
    for (const disposable of disposables.toReversed()) {
      await this.guard(id, 'dispose', disposable);
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
}
