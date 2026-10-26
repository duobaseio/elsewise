import type { SettingsPanel } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SettingsPanelManager } from './settings-panel-manager';

// Returns a panel with `id`.
function panel(id: string): SettingsPanel {
  return { id, label: id, terms: {}, component: () => null };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('constructor', () => {
  test('starts with defaults', () => {
    const a = panel('a');
    const settings = new SettingsPanelManager([a]);

    expect(settings.panels).toEqual([a]);
  });
});

describe('add', () => {
  test('appends after defaults, omitting their ids', () => {
    const settings = new SettingsPanelManager([panel('a')]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const b = panel('b');
    settings.add([panel('a'), b]);

    expect(settings.panels.map((panel) => panel.id)).toEqual(['a', 'b']);
    expect(settings.panels[1]).toBe(b);
  });

  test('appends panels until disposed', () => {
    const settings = new SettingsPanelManager();
    const first = [panel('a')];
    const second = [panel('b')];
    const dispose = settings.add(first);
    settings.add(second);

    expect(settings.panels).toEqual([...first, ...second]);

    dispose();

    expect(settings.panels).toEqual(second);
  });

  test('omits existing id, warning', () => {
    const settings = new SettingsPanelManager();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = panel('a');
    settings.add([a]);
    settings.add([panel('a'), panel('b')]);

    expect(settings.panels.map((panel) => panel.id)).toEqual(['a', 'b']);
    expect(settings.panels[0]).toBe(a);
    expect(warn).toHaveBeenCalledWith('Settings panel a already exists');
  });

  test('frees id when disposed', () => {
    const settings = new SettingsPanelManager();
    const dispose = settings.add([panel('a')]);
    dispose();
    const again = panel('a');
    settings.add([again]);

    expect(settings.panels).toEqual([again]);
  });

  test('notifies on add and dispose', () => {
    const settings = new SettingsPanelManager();
    const listener = vi.fn();
    settings.subscribe(listener);
    const dispose = settings.add([panel('a')]);
    dispose();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
