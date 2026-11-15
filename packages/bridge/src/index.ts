import type { DaemonBridge } from './daemon';
import type { PluginsBridge } from './plugins';
import type { ProjectsBridge } from './projects';
import type { SettingsBridge } from './settings';
import type { WindowBridge } from './window';
import type { WorkspacesBridge } from './workspaces';

export { type DaemonBridge, DaemonConnection } from './daemon';
export { InstalledFrontendPlugin, type PluginsBridge } from './plugins';
export { DEFAULT_PROJECT_LAYOUT, ProjectLayout, type ProjectsBridge } from './projects';
export type { Json, SettingsBridge } from './settings';
export type { WindowBridge } from './window';
export { DEFAULT_WORKSPACE_STATE, WorkspaceState, type WorkspacesBridge } from './workspaces';

declare global {
  interface Window {
    /**
     * The APIs the embedder additionally provides.
     */
    bridge?: {
      /**
       * The embedder's version, following SemVer, e.g. `1.2.3`.
       */
      version?: string;
      /**
       * See {@link WindowBridge}.
       */
      window?: WindowBridge;
      /**
       * See {@link DaemonBridge}.
       */
      daemon?: DaemonBridge;
      /**
       * See {@link PluginsBridge}.
       */
      plugins?: PluginsBridge;
      /**
       * See {@link SettingsBridge}.
       */
      settings?: SettingsBridge;
      /**
       * See {@link ProjectsBridge}.
       */
      projects?: ProjectsBridge;
      /**
       * See {@link WorkspacesBridge}.
       */
      workspaces?: WorkspacesBridge;
    };
  }
}
