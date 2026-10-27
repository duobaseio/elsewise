import {
  DEFAULT_SETTINGS_GROUPS,
  type Disposable,
  type Settings,
  type SettingsLanguagePreview,
  type SettingsPanel,
} from '@elsewise/plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { LANGUAGES } from '@/settings/languages';

const GROUPS: readonly string[] = Object.values(DEFAULT_SETTINGS_GROUPS);

/**
 * The settings as plugins see them.
 */
export class SettingsPanelManager implements Settings {
  private readonly listeners = new Set<() => void>();
  private addedPanels: readonly (readonly SettingsPanel[])[];
  private currentPanels: readonly SettingsPanel[];
  private addedPreviews: readonly (readonly SettingsLanguagePreview[])[] = [];
  private currentPreviews: Readonly<Record<string, SettingsLanguagePreview>> = {};

  constructor(defaults: readonly SettingsPanel[] = []) {
    this.addedPanels = [defaults];
    this.currentPanels = defaults;
  }

  /**
   * The built-in panels, then those plugins added in order of addition.
   */
  get panels(): readonly SettingsPanel[] {
    return this.currentPanels;
  }

  /**
   * {@inheritDoc}
   */
  add(panels: readonly SettingsPanel[]): Disposable {
    const known = new Map(this.addedPanels.flat().map((panel) => [panel.id, panel]));
    const added = panels.filter((panel) => {
      if (known.has(panel.id)) {
        console.warn(`Settings panel ${panel.id} already exists`);
        return false;
      }

      const parent = panel.in === undefined || GROUPS.includes(panel.in) ? undefined : known.get(panel.in);
      if (panel.in !== undefined && !GROUPS.includes(panel.in) && parent === undefined) {
        console.warn(`Settings panel ${panel.id} is in unknown panel ${panel.in}`);
        return false;
      }
      if (parent?.in !== undefined && !GROUPS.includes(parent.in)) {
        console.warn(`Settings panel ${panel.id} is in ${panel.in}, which is itself in a panel`);
        return false;
      }

      known.set(panel.id, panel);
      return true;
    });
    this.addedPanels = [...this.addedPanels, added];
    this.currentPanels = this.addedPanels.flat();
    this.notify();
    return () => {
      const removed = new Set(added.map((panel) => panel.id));
      this.addedPanels = this.addedPanels
        .filter((other) => other !== added)
        .map((other) => other.filter((panel) => panel.in === undefined || !removed.has(panel.in)));
      this.currentPanels = this.addedPanels.flat();
      this.notify();
    };
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
