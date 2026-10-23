import type { PluginsBridge } from './plugins.js';
import type { SettingsBridge } from './settings.js';
import type { WindowBridge } from './window.js';

export { InstalledPlugin, InvalidPlugin, PluginEntry, PluginId, type PluginsBridge } from './plugins.js';
export {
  Brightness,
  BundledKeymap,
  BundledTheme,
  CursorStyle,
  DEFAULT_SETTINGS,
  DiffLayout,
  EditorLanguageSettings,
  FONT_SIZES,
  Font,
  FontSize,
  type Json,
  KeymapId,
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
