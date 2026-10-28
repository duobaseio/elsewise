import type { LocalSettingsPanel } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';

// Returns a local panel with `id`, listed in the group or panel `in`.
function panel(id: string, inside = 'appearance'): LocalSettingsPanel {
  return { scope: 'local', id, label: id, in: inside, terms: {}, component: () => null };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add', () => {
  test('appends after defaults, omitting default ids', () => {
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

  test('frees disposed id', () => {
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

  test('omits panel in panel of other scope, warning', () => {
    const settings = new SettingsPanelManager([panel('a')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    settings.add([{ scope: 'remote', id: 'b', label: 'b', in: 'a', terms: {}, component: () => null }]);

    expect(settings.panels.map((panel) => panel.id)).toEqual(['a']);
    expect(warn).toHaveBeenCalledWith('Settings panel b is remote, but a is local');
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

describe('addLanguagePreviews', () => {
  test('keys previews by language, later addition replacing earlier', () => {
    const settings = new SettingsPanelManager();
    settings.addLanguagePreviews([
      { language: 'a', path: 'a.toy', code: 'first' },
      { language: 'b', path: 'b.toy', code: 'b' },
    ]);
    const dispose = settings.addLanguagePreviews([{ language: 'a', path: 'a.toy', code: 'second' }]);

    expect(settings.previews).toEqual({
      a: { language: 'a', path: 'a.toy', code: 'second' },
      b: { language: 'b', path: 'b.toy', code: 'b' },
    });

    dispose();

    expect(settings.previews.a).toEqual({ language: 'a', path: 'a.toy', code: 'first' });
  });

  test('keys preview by name language is listed as', () => {
    const settings = new SettingsPanelManager();
    settings.addLanguagePreviews([{ language: 'JSX', path: 'a.jsx', code: 'a' }]);

    expect(Object.keys(settings.previews)).toEqual(['JavaScript']);
  });

  test('notifies on addition and disposal', () => {
    const settings = new SettingsPanelManager();
    const listener = vi.fn();
    settings.subscribe(listener);
    const dispose = settings.addLanguagePreviews([{ language: 'a', path: 'a.toy', code: 'a' }]);
    dispose();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
