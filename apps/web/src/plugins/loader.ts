import type { InstalledPlugin, InvalidPlugin } from '@elsewise/bridge';
import type { Disposable, Plugin, PluginInfo } from '@elsewise/plugin';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import type { ApplicationManager } from '@/application-manager';

/**
 * Every installed plugin, and every invalid one.
 */
export const pluginsQuery = queryOptions({
  queryKey: ['plugins'],
  queryFn: async (): Promise<readonly (InstalledPlugin | InvalidPlugin)[]> => {
    const plugins = (await window.bridge?.plugins?.load()) ?? [];
    for (const plugin of plugins) {
      if ('error' in plugin || !plugin.enabled) {
        continue;
      }
      for (const theme of plugin.themes) {
        if ('error' in theme) {
          console.error(`Plugin ${plugin.manifest.id}'s theme ${theme.id} failed to load: ${theme.error}`);
        }
      }
      for (const keymap of plugin.keymaps) {
        if ('error' in keymap) {
          console.error(`Plugin ${plugin.manifest.id}'s keymap ${keymap.id} failed to load: ${keymap.error}`);
        }
      }
    }
    return plugins;
  },
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

  constructor(private readonly application: ApplicationManager) {}

  /**
   * Enables the plugin with `id`, importing its code first.
   *
   * Returns whether the plugin is enabled, false if its code failed to load or enable.
   */
  async enable(id: string, url: string): Promise<boolean> {
    const enabled = await this.enqueue(id, async (loaded) => {
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
        const disposables = (await plugin.onEnable?.(this.application)) ?? [];

        const listeners: Disposable[] = [];
        if (plugin.onBrightnessChange) {
          listeners.push(
            this.application.appearance.onBrightnessChange((brightness) =>
              this.call(id, 'onBrightnessChange', () => plugin.onBrightnessChange?.(brightness)),
            ),
          );
        }
        if (plugin.onThemeChange) {
          listeners.push(
            this.application.appearance.onThemeChange((theme) =>
              this.call(id, 'onThemeChange', () => plugin.onThemeChange?.(theme)),
            ),
          );
        }
        if (plugin.onKeymapChange) {
          listeners.push(
            this.application.commands.onKeymapChange((keymap) =>
              this.call(id, 'onKeymapChange', () => plugin.onKeymapChange?.(keymap)),
            ),
          );
        }

        return { plugin, onEnableDisposables: disposables, listeners };
      } catch (error) {
        console.error(`Plugin ${id} failed to enable`, error);
        return;
      }
    });
    return enabled !== undefined;
  }

  /**
   * Disables the plugin with `id`.
   *
   * Waits for the plugin's pending enable or disable first, and does nothing if it is then disabled.
   */
  async disable(id: string): Promise<void> {
    await this.enqueue(id, async (loaded) => {
      if (!loaded) {
        return;
      }

      for (const listener of loaded.listeners) {
        listener();
      }
      if (loaded.plugin.onDisable) {
        await this.guard(id, 'disable', () => loaded.plugin.onDisable?.(this.application));
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
    return next;
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
