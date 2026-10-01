import type { SettingsBridge } from './settings.ts';
import type { WindowBridge } from './window.ts';

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
} from './settings.ts';
export type { WindowBridge } from './window.ts';

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
