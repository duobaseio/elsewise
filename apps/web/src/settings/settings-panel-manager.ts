import {
  DEFAULT_SETTINGS_GROUPS,
  type Disposable,
  type LocalSettingsPanel,
  type RemoteSettingsPanel,
  type Settings,
  type SettingsLanguagePreview,
} from '@elsewise/plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { LANGUAGES } from '@/settings/languages';

const GROUPS: readonly string[] = Object.values(DEFAULT_SETTINGS_GROUPS);

/**
 * The settings as plugins see them.
 */
export class SettingsPanelManager implements Settings {
  private readonly listeners = new Set<() => void>();
  private addedPanels: readonly (readonly (LocalSettingsPanel | RemoteSettingsPanel)[])[] = [];
  private currentLocalPanels: readonly LocalSettingsPanel[] = [];
  private currentRemotePanels: readonly RemoteSettingsPanel[] = [];
  private addedPreviews: readonly (readonly SettingsLanguagePreview[])[] = [];
  private currentPreviews: Readonly<Record<string, SettingsLanguagePreview>> = {};

  constructor(defaults: readonly (LocalSettingsPanel | RemoteSettingsPanel)[] = []) {
    this.addedPanels = [defaults];
    this.updatePanels();
  }

  /**
   * The built-in local panels, then those plugins added in order of addition.
   */
  get localPanels(): readonly LocalSettingsPanel[] {
    return this.currentLocalPanels;
  }

  /**
   * The built-in remote panels, then those plugins added in order of addition.
   */
  get remotePanels(): readonly RemoteSettingsPanel[] {
    return this.currentRemotePanels;
  }

  /**
   * {@inheritDoc}
   */
  add(panels: readonly (LocalSettingsPanel | RemoteSettingsPanel)[]): Disposable {
    const known = new Map(this.addedPanels.flat().map((panel) => [panel.id, panel]));
    const added = panels.filter((panel) => {
      if (known.has(panel.id)) {
        console.warn(`Settings panel ${panel.id} already exists`);
        return false;
      }

      const parent = GROUPS.includes(panel.in) ? undefined : known.get(panel.in);
      if (!GROUPS.includes(panel.in) && parent === undefined) {
        console.warn(`Settings panel ${panel.id} is in unknown panel ${panel.in}`);
        return false;
      }

      if (parent !== undefined && !GROUPS.includes(parent.in)) {
        console.warn(`Settings panel ${panel.id} is in ${panel.in}, which is itself in a panel`);
        return false;
      }

      if (parent !== undefined && parent.scope !== panel.scope) {
        console.warn(`Settings panel ${panel.id} is ${panel.scope}, but ${panel.in} is ${parent.scope}`);
        return false;
      }

      known.set(panel.id, panel);
      return true;
    });
    this.addedPanels = [...this.addedPanels, added];
    this.updatePanels();
    return () => {
      const removed = new Set(added.map((panel) => panel.id));
      this.addedPanels = this.addedPanels
        .filter((other) => other !== added)
        .map((other) => other.filter((panel) => !removed.has(panel.in)));
      this.updatePanels();
    };
  }

  private updatePanels() {
    const panels = this.addedPanels.flat();
    this.currentLocalPanels = panels.filter((panel) => panel.scope === 'local');
    this.currentRemotePanels = panels.filter((panel) => panel.scope === 'remote');
    this.notify();
  }

  /**
   * The previews plugins added, by language, a later addition replacing an earlier one.
   */
  get previews(): Readonly<Record<string, SettingsLanguagePreview>> {
    return this.currentPreviews;
  }

  /**
   * {@inheritDoc}
   */
  addLanguagePreviews(previews: readonly SettingsLanguagePreview[]): Disposable {
    const added = [...previews];
    this.addedPreviews = [...this.addedPreviews, added];
    this.updatePreviews();
    return () => {
      this.addedPreviews = this.addedPreviews.filter((other) => other !== added);
      this.updatePreviews();
    };
  }

  private updatePreviews() {
    const previews: Record<string, SettingsLanguagePreview> = {};
    for (const preview of this.addedPreviews.flat()) {
      // Some languages, e.g. JS & JSX, share the same settings page.
      const canonical = LANGUAGES[preview.language];
      previews[canonical?.name ?? preview.language] = preview;
    }
    this.currentPreviews = previews;
    this.notify();
  }

  /**
   * Registers a `listener` that is called when a panel or preview is added or removed.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Settings listener failed', error);
      }
    }
  }
}

export const SettingsPanelManagerContext = createContext<SettingsPanelManager | null>(null);

/**
 * Returns the settings as plugins see them.
 */
export function useSettingsPanels(): SettingsPanelManager;
export function useSettingsPanels<T>(select: (settings: SettingsPanelManager) => T): T;
export function useSettingsPanels<T>(select?: (settings: SettingsPanelManager) => T): SettingsPanelManager | T {
  const settings = useContext(SettingsPanelManagerContext);
  if (settings === null) {
    throw new Error('Missing SettingsPanelManagerContext');
  }

  const subscribe = useCallback((listener: () => void) => settings.subscribe(listener), [settings]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? settings : select(settings)));
}
