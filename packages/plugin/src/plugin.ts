/**
 * The plugin's information which is passed to a plugin main module's default export function.
 */
export interface PluginInfo {
  /**
   * The plugin's id.
   */
  readonly id: string;
}

/**
 * A function that releases a resource when called.
 *
 * Elsewise waits for it if it returns a promise.
 */
export type Disposable = () => void | Promise<void>;
