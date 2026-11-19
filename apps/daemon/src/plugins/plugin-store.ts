import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type EnabledSnapshot,
  type InstalledPlugin,
  type InvalidPlugin,
  PluginResolver,
  type Scope,
} from '@elsewise/core';
import { readPluginsSync } from '@elsewise/core/node';
import type { Daemon, Disposable, Plugin } from '@elsewise/daemon-plugin';
import type { DataDirectory } from '../directories';
import { VERSION } from '../global';
import type { Registries } from './registry';

/**
 * The installed plugins, loaded from the data directory, whose daemon parts run in the daemon.
 *
 * A load returns each folder in `plugins/` with its `manifest.json`, and whether `plugins.json` enables it. It
 * rejects a malformed `plugins.json` rather than repair it.
 */
export class PluginStore extends PluginResolver<InstalledPlugin, Registries, Plugin, EnabledSnapshot, Daemon> {
  protected readonly part = 'daemon';
  protected readonly version = VERSION;
  private readonly data: DataDirectory;

  constructor(data: DataDirectory) {
    super();
    this.data = data;
  }

  protected installed(): Promise<(InstalledPlugin | InvalidPlugin)[]>;
  protected installed(id: string): Promise<InstalledPlugin | InvalidPlugin | undefined>;
  protected async installed(
    id?: string,
  ): Promise<(InstalledPlugin | InvalidPlugin)[] | InstalledPlugin | InvalidPlugin | undefined> {
    if (id !== undefined) {
      const plugin = readPluginsSync(this.data.plugins, this.data.pluginsManifest, id);
      return plugin === undefined ? undefined : this.withUrl(plugin);
    }
    return readPluginsSync(this.data.plugins, this.data.pluginsManifest).map((plugin) => this.withUrl(plugin));
  }

  private withUrl(plugin: InstalledPlugin | InvalidPlugin): InstalledPlugin | InvalidPlugin {
    if ('error' in plugin || plugin.manifest.daemon === undefined) {
      return plugin;
    }

    const { id, daemon } = plugin.manifest;
    return { ...plugin, url: pathToFileURL(path.join(this.data.plugins, id, 'daemon', daemon.main)).href };
  }

  protected scope(id: string, registries: Registries): Scope<Daemon> {
    const added: Disposable[] = [];
    const track = (remove: Disposable): Disposable => {
      added.push(remove);
      return remove;
    };
    return {
      api: {
        agents: { add: (agent) => track(registries.agents.addFrom(id, agent)) },
        mcpServers: { add: (server) => track(registries.mcpServers.add(server.name, server)) },
      },
      dispose: async () => {
        for (const remove of added.toReversed()) {
          await remove();
        }
      },
    };
  }

  protected onEnable(): readonly Disposable[] {
    return [];
  }

  protected describe(_plugin: InstalledPlugin, snapshot: EnabledSnapshot): EnabledSnapshot {
    return snapshot;
  }
}
