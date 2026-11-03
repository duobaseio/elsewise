import type { InstalledFrontendPlugin, InvalidPlugin } from '@elsewise/bridge';
import { type EnabledSnapshot, PluginResolver, type PluginSnapshot } from '@elsewise/core';
import type { Disposable, Keymap, Plugin as PluginImplementation, Theme } from '@elsewise/frontend-plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { ApplicationManager } from '@/application-manager';

export type Plugin = PluginSnapshot<EnabledPlugin>;

interface EnabledPlugin extends EnabledSnapshot {
  readonly themes: readonly { readonly id: string; readonly theme: Theme }[];
  readonly keymaps: readonly { readonly id: string; readonly keymap: Keymap }[];
}

/**
 * The installed plugins, loaded through the bridge, whose frontend parts run in the app.
 */
export class PluginStore extends PluginResolver<
  InstalledFrontendPlugin,
  ApplicationManager,
  PluginImplementation,
  EnabledPlugin
> {
  protected readonly part = 'frontend';

  protected get version(): string | undefined {
    return window.bridge?.version;
  }

  protected installed(): Promise<(InstalledFrontendPlugin | InvalidPlugin)[]>;
  protected installed(id: string): Promise<InstalledFrontendPlugin | InvalidPlugin | undefined>;
  protected async installed(
    id?: string,
  ): Promise<(InstalledFrontendPlugin | InvalidPlugin)[] | InstalledFrontendPlugin | InvalidPlugin | undefined> {
    return id === undefined ? ((await window.bridge?.plugins?.load()) ?? []) : window.bridge?.plugins?.load(id);
  }

  protected override onLoad(id: string, plugin: InstalledFrontendPlugin): void {
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

  protected onEnable(id: string, plugin: PluginImplementation, application: ApplicationManager): readonly Disposable[] {
    const listeners: Disposable[] = [];
    if (plugin.onBrightnessChange) {
      listeners.push(
        application.appearance.onBrightnessChange((brightness) =>
          this.call(id, 'onBrightnessChange', () => plugin.onBrightnessChange?.(brightness)),
        ),
      );
    }

    if (plugin.onThemeChange) {
      listeners.push(
        application.appearance.onThemeChange((theme) =>
          this.call(id, 'onThemeChange', () => plugin.onThemeChange?.(theme)),
        ),
      );
    }

    if (plugin.onKeymapChange) {
      listeners.push(
        application.commands.onKeymapChange((keymap) =>
          this.call(id, 'onKeymapChange', () => plugin.onKeymapChange?.(keymap)),
        ),
      );
    }
    return listeners;
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

  protected describe(plugin: InstalledFrontendPlugin, snapshot: EnabledSnapshot): EnabledPlugin {
    return {
      ...snapshot,
      themes: plugin.themes.flatMap((theme) => ('error' in theme ? [] : [theme])),
      keymaps: plugin.keymaps.flatMap((keymap) => ('error' in keymap ? [] : [keymap])),
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
