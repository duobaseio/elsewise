import type { ComponentType } from 'react';

/**
 * Represents an Elsewise plugin.
 */
export interface Plugin {
  /**
   * Called when Elsewise enables the plugin.
   */
  enable(context: PluginContext): void | Promise<void>;

  /**
   * Called when Elsewise disables the plugin.
   */
  disable?(): void | Promise<void>;
}

/**
 * A plugin's access to Elsewise, passed to {@link Plugin.enable}.
 */
export interface PluginContext {
  /** The plugin's id. */
  readonly id: string;

  /**
   * The plugin's disposables, disposed in reverse order when Elsewise unloads the plugin.
   */
  readonly subscriptions: Disposable[];

  // TODO: nuke
  /** See {@link StubRegistry}. */
  readonly stubRegistry: StubRegistry;
}

/**
 * A resource that is released when disposed.
 */
export interface Disposable {
  /**
   * Releases the resource.
   */
  dispose(): void;
}

/**
 * The panels a plugin contributes.
 *
 * TODO: nuke
 */
export interface StubRegistry {
  /**
   * Registers a React `component` that renders the panel `id`.
   *
   * Returns a disposable that unregisters the `component`.
   */
  register(id: string, component: ComponentType): Disposable;
}
