import type { Disposable, Settings, SettingsPanel } from '@elsewise/plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

/**
 * The settings as plugins see them.
 */
export class SettingsPanelManager implements Settings {
  private readonly listeners = new Set<() => void>();
  private addedPanels: readonly (readonly SettingsPanel[])[];
  private currentPanels: readonly SettingsPanel[];

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
    const ids = new Set(this.currentPanels.map((panel) => panel.id));
    const added = panels.filter((panel) => {
      if (ids.has(panel.id)) {
        console.warn(`Settings panel ${panel.id} already exists`);
        return false;
      }

      ids.add(panel.id);
      return true;
    });
    this.addedPanels = [...this.addedPanels, added];
    this.currentPanels = this.addedPanels.flat();
    this.notify();
    return () => {
      this.addedPanels = this.addedPanels.filter((other) => other !== added);
      this.currentPanels = this.addedPanels.flat();
      this.notify();
    };
  }

  /**
   * Registers a `listener` that is called when a panel is added or removed.
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
