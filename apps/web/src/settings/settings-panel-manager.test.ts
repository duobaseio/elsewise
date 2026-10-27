import type { SettingsPanel } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SettingsPanelManager } from './settings-panel-manager';

// Returns a panel with `id`, listed in the group or panel `in`.
function panel(id: string, inside?: string): SettingsPanel {
  return { id, label: id, terms: {}, component: () => null, ...(inside === undefined ? {} : { in: inside }) };
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

  test('accepts panel in group or earlier panel', () => {
    const settings = new SettingsPanelManager([panel('a', 'appearance')]);
    settings.add([panel('b'), panel('c', 'a'), panel('d', 'b')]);

    expect(settings.panels.map((panel) => panel.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('omits panel in unknown panel, warning', () => {
    const settings = new SettingsPanelManager();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    settings.add([panel('a', 'missing')]);

    expect(settings.panels).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Settings panel a is in unknown panel missing');
  });

  test('omits panel in nested panel, warning', () => {
    const settings = new SettingsPanelManager([panel('a'), panel('b', 'a')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    settings.add([panel('c', 'b')]);

    expect(settings.panels.map((panel) => panel.id)).toEqual(['a', 'b']);
    expect(warn).toHaveBeenCalledWith('Settings panel c is in b, which is itself in a panel');
  });

  test('removes panels in disposed panel', () => {
    const settings = new SettingsPanelManager();
    const dispose = settings.add([panel('a')]);
    settings.add([panel('b', 'a'), panel('c')]);
    dispose();

    expect(settings.panels.map((panel) => panel.id)).toEqual(['c']);

    settings.add([panel('a')]);

    expect(settings.panels.map((panel) => panel.id)).toEqual(['c', 'a']);
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
