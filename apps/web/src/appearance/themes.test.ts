import { BundledTheme } from '@elsewise/bridge';
import { Theme } from '@elsewise/plugin';
import { describe, expect, test } from 'vitest';
import elsewise from './bundled/elsewise.json';
import { type LoadedTheme, resolveActiveTheme, THEMES } from './themes';

const NIGHT: LoadedTheme = {
  id: { source: 'plugin', plugin: 'com.acme.themes', name: 'night' },
  theme: {
    name: 'Night',
    dark: {
      interface: { background: '#000000', foreground: '#eeeeee' },
      editor: { background: '#010101', tokens: { keyword: { color: '#ff0000' }, punctuation: { bold: true } } },
      terminal: { red: '#ff5555' },
    },
  },
};

const ELSEWISE = Theme.parse(elsewise);

describe('THEMES', () => {
  test('loads every bundled theme', () => {
    expect(THEMES.map(({ id }) => id.name)).toEqual(BundledTheme.options);
  });
});

describe('resolveActiveTheme', () => {
  test("returns Elsewise's colors for unknown theme", () => {
    expect(resolveActiveTheme([NIGHT], { source: 'elsewise', name: 'dracula' }, 'dark')).toEqual(ELSEWISE.dark);
  });

  test("returns Elsewise's colors for same-named theme from another plugin", () => {
    const id = { source: 'plugin', plugin: 'com.other.themes', name: 'night' } as const;

    expect(resolveActiveTheme([NIGHT], id, 'dark')).toEqual(ELSEWISE.dark);
  });

  test("returns Elsewise's variant for theme without one for brightness", () => {
    expect(resolveActiveTheme([NIGHT], NIGHT.id, 'light')).toEqual(ELSEWISE.light);
  });

  test("fills unspecified colors with Elsewise's", () => {
    expect(resolveActiveTheme([NIGHT], NIGHT.id, 'dark')).toEqual({
      interface: { ...ELSEWISE.dark?.interface, background: '#000000', foreground: '#eeeeee' },
      editor: {
        ...ELSEWISE.dark?.editor,
        background: '#010101',
        tokens: { ...ELSEWISE.dark?.editor.tokens, keyword: { color: '#ff0000' }, punctuation: { bold: true } },
      },
      terminal: { ...ELSEWISE.dark?.terminal, red: '#ff5555' },
    });
  });
});
