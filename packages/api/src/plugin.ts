import type { ComponentType } from 'react';

/**
 * The modules Elsewise provides its own instances of, e.g. `react`. A plugin's bundle must leave them external.
 */
export const SHARED_MODULES = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'] as const;

/**
 * The functions a plugin's main module exports.
 */
export interface Plugin {
  /**
   * Called when Elsewise loads the plugin.
   */
  activate(context: PluginContext): void | Promise<void>;

  /**
   * Called when Elsewise unloads the plugin.
   */
  deactivate?(): void | Promise<void>;
}

/**
 * What Elsewise provides a plugin.
 */
export interface PluginContext {
  /** The plugin's id. */
  readonly id: string;

  /** See {@link StubRegistry}. */
  readonly stubRegistry: StubRegistry;

  /**
   * The plugin's disposables, disposed in reverse order when Elsewise unloads the plugin.
   */
  readonly subscriptions: Disposable[];
}

/**
 * The panels a plugin contributes.
 *
 * TODO: Remove once testing has finished.
 */
export interface StubRegistry {
  /**
   * Registers a React `component` that renders the panel `id`.
   *
   * Returns a disposable that unregisters the `component`.
   */
  register(id: string, component: ComponentType): Disposable;
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
