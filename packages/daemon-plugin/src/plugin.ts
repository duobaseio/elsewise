import type { Disposable } from '@elsewise/plugin';

/**
 * A `Plugin`.
 *
 * To create a plugin, declare the following default function in your project's main module:
 * ```ts
 * export default function ({ id }: PluginInfo): Plugin {
 *   return {
 *     async onEnable() {
 *       const index = await buildIndex();
 *       return [() => index.close()];
 *     },
 *   };
 * }
 * ```
 */
export interface Plugin {
  /**
   * Called when the plugin is enabled.
   *
   * The disposables it returns are disposed in reverse order when the plugin is disabled. It is recommended to avoid
   * computationally expensive and high latency operations in this function since it may affect start-up time.
   *
   * Throwing an error causes the plugin to be disabled (without calling `onDisable`). It is the plugin's responsibility
   * to safely dispose of any added items in such cases.
   */
  // TODO: Pass the daemon, once it has an API for plugins.
  onEnable?(): Disposable[] | undefined | Promise<Disposable[] | undefined>;

  /**
   * Called when the plugin is disabled, before the disposables `onEnable` returned are disposed.
   */
  onDisable?(): void | Promise<void>;
}
