import type { PluginsBridge } from './plugins.js';
import type { SettingsBridge } from './settings.js';
import type { WindowBridge } from './window.js';

export { InstalledPlugin, PluginId, type PluginsBridge } from './plugins.js';
export {
  Brightness,
  BundledTheme,
  CursorStyle,
  DEFAULT_SETTINGS,
  EditorLanguageSettings,
  FONT_SIZES,
  Font,
  FontSize,
  type Json,
  LineSeparator,
  Settings,
  type SettingsBridge,
  ThemeId,
} from './settings.js';
export type { WindowBridge } from './window.js';

declare global {
  interface Window {
    /**
     * The APIs the embedder additionally provides.
     */
    bridge?: {
      /**
       * See {@link PluginsBridge}.
       */
      plugins?: PluginsBridge;
      /**
       * See {@link SettingsBridge}.
       */
      settings?: SettingsBridge;
      /**
       * See {@link WindowBridge}.
       */
      window?: WindowBridge;
    };
  }
}
