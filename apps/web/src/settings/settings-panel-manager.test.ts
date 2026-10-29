import type { LocalSettingsPanel, RemoteSettingsPanel } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';

function localPanel(id: string, inside = 'appearance'): LocalSettingsPanel {
  return { scope: 'local', id, label: id, in: inside, terms: {}, component: () => null };
}

function remotePanel(id: string, inside = 'appearance'): RemoteSettingsPanel {
  return { scope: 'remote', id, label: id, in: inside, terms: {}, component: () => null };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add', () => {
  test('appends after defaults, omitting default ids', () => {
    const settings = new SettingsPanelManager([localPanel('a')]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const b = localPanel('b');
    settings.add([localPanel('a'), b]);

    expect(settings.localPanels.map((panel) => panel.id)).toEqual(['a', 'b']);
    expect(settings.localPanels[1]).toBe(b);
  });

  test('appends panels until disposed', () => {
    const settings = new SettingsPanelManager();
    const first = [localPanel('a')];
    const second = [localPanel('b')];
    const dispose = settings.add(first);
    settings.add(second);

    expect(settings.localPanels).toEqual([...first, ...second]);

    dispose();

    expect(settings.localPanels).toEqual(second);
  });

  test('omits existing id, warning', () => {
    const settings = new SettingsPanelManager();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = localPanel('a');
    settings.add([a]);
    settings.add([localPanel('a'), localPanel('b')]);

    expect(settings.localPanels.map((panel) => panel.id)).toEqual(['a', 'b']);
    expect(settings.localPanels[0]).toBe(a);
    expect(warn).toHaveBeenCalledWith('Settings panel a already exists');
  });

  test('frees disposed id', () => {
    const settings = new SettingsPanelManager();
    const dispose = settings.add([localPanel('a')]);
    dispose();
    const again = localPanel('a');
    settings.add([again]);

    expect(settings.localPanels).toEqual([again]);
  });

  test('accepts panel in group or earlier panel', () => {
    const settings = new SettingsPanelManager([localPanel('a', 'appearance')]);
    settings.add([localPanel('b'), localPanel('c', 'a'), localPanel('d', 'b')]);

    expect(settings.localPanels.map((panel) => panel.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('omits panel in unknown panel, warning', () => {
    const settings = new SettingsPanelManager();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    settings.add([localPanel('a', 'missing')]);

    expect(settings.localPanels).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Settings panel a is in unknown panel missing');
  });

  test('omits panel in nested panel, warning', () => {
    const settings = new SettingsPanelManager([localPanel('a'), localPanel('b', 'a')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    settings.add([localPanel('c', 'b')]);

    expect(settings.localPanels.map((panel) => panel.id)).toEqual(['a', 'b']);
    expect(warn).toHaveBeenCalledWith('Settings panel c is in b, which is itself in a panel');
  });

  test('separates panels by scope', () => {
    const settings = new SettingsPanelManager([localPanel('a')]);
    const b = remotePanel('b');
    settings.add([b, localPanel('c')]);

    expect(settings.localPanels.map((panel) => panel.id)).toEqual(['a', 'c']);
    expect(settings.remotePanels).toEqual([b]);
  });

  test('omits existing id of other scope, warning', () => {
    const settings = new SettingsPanelManager([localPanel('a')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    settings.add([remotePanel('a')]);

    expect(settings.remotePanels).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Settings panel a already exists');
  });

  test('omits panel in panel of other scope, warning', () => {
    const settings = new SettingsPanelManager([localPanel('a')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    settings.add([remotePanel('b', 'a')]);

    expect(settings.remotePanels).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Settings panel b is remote, but a is local');
  });

  test('removes panels in disposed panel', () => {
    const settings = new SettingsPanelManager();
    const dispose = settings.add([localPanel('a')]);
    settings.add([localPanel('b', 'a'), localPanel('c')]);
    dispose();

    expect(settings.localPanels.map((panel) => panel.id)).toEqual(['c']);

    settings.add([localPanel('a')]);

    expect(settings.localPanels.map((panel) => panel.id)).toEqual(['c', 'a']);
  });

  test('notifies on add and dispose', () => {
    const settings = new SettingsPanelManager();
    const listener = vi.fn();
    settings.subscribe(listener);
    const dispose = settings.add([localPanel('a')]);
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
