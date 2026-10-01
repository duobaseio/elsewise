import type { SettingsBridge } from './settings.js';
import type { WindowBridge } from './window.js';

export {
  type Brightness,
  type CursorStyle,
  type EditorLanguageSettings,
  FONT_SIZES,
  type Font,
  type FontSize,
  type Json,
  type LineSeparator,
  type Settings,
  type SettingsBridge,
} from './settings.js';
export type { WindowBridge } from './window.js';

declare global {
  interface Window {
    /**
     * The APIs the embedder additionally provides.
     */
    bridge?: {
      /** See {@link SettingsBridge}. */
      settings?: SettingsBridge;
      /** See {@link WindowBridge}. */
      window?: WindowBridge;
    };
  }
}
