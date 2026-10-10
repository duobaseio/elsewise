import { BundledTheme } from '@elsewise/bridge';
import elsewiseCss from '@elsewise/components/elsewise.css?raw';
import { Theme, ThemeVariant } from '@elsewise/plugin';
import { describe, expect, test } from 'vitest';
import elsewise from './bundled/elsewise.json';
import { type LoadedTheme, resolveTheme, THEMES } from './themes';

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

describe('resolveTheme', () => {
  test("returns Elsewise's colors for an unknown theme", () => {
    expect(resolveTheme([NIGHT], { source: 'elsewise', name: 'dracula' }, 'dark')).toEqual(ELSEWISE.dark);
  });

  test("returns Elsewise's colors for a theme of the same name from another plugin", () => {
    const id = { source: 'plugin', plugin: 'com.other.themes', name: 'night' } as const;

    expect(resolveTheme([NIGHT], id, 'dark')).toEqual(ELSEWISE.dark);
  });

  test("returns Elsewise's variant for a theme without one for the brightness", () => {
    expect(resolveTheme([NIGHT], NIGHT.id, 'light')).toEqual(ELSEWISE.light);
  });

  test("fills the colors a theme leaves unspecified with Elsewise's", () => {
    expect(resolveTheme([NIGHT], NIGHT.id, 'dark')).toEqual({
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

describe('elsewise.json', () => {
  // The custom properties of each of `elsewise.css`'s blocks, light then dark, leaving out the aliases, which follow
  // their targets, and the shadow, which a theme does not color.
  const blocks = [...elsewiseCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\{([^}]*)\}/g)].map(([, block]) =>
    Object.fromEntries(
      [...(block ?? '').matchAll(/--([\w-]+):\s*([^;]+);/g)]
        .map(([, name, value]) => [name, value?.trim()])
        .filter(([name, value]) => !value?.startsWith('var(') && name !== 'shadow-elevated'),
    ),
  );

  test("states elsewise.css's colors", () => {
    expect(blocks).toHaveLength(2);
    expect(ELSEWISE.light?.interface).toEqual(blocks[0]);
    expect(ELSEWISE.dark?.interface).toEqual(blocks[1]);
  });

  test('states every color of the interface', () => {
    const keys = Object.keys(ThemeVariant.unwrap().shape.interface.unwrap().shape).sort();

    expect(keys).toHaveLength(43);
    expect(Object.keys(ELSEWISE.light?.interface ?? {}).sort()).toEqual(keys);
    expect(Object.keys(ELSEWISE.dark?.interface ?? {}).sort()).toEqual(keys);
  });

  test('states every color of the editor', () => {
    const keys = Object.keys(ThemeVariant.unwrap().shape.editor.unwrap().shape).sort();

    expect(keys).toHaveLength(25);
    expect(Object.keys(ELSEWISE.light?.editor ?? {}).sort()).toEqual(keys);
    expect(Object.keys(ELSEWISE.dark?.editor ?? {}).sort()).toEqual(keys);
  });

  test('states every color of the terminal', () => {
    const keys = Object.keys(ThemeVariant.unwrap().shape.terminal.unwrap().shape).sort();

    expect(keys).toHaveLength(21);
    expect(Object.keys(ELSEWISE.light?.terminal ?? {}).sort()).toEqual(keys);
    expect(Object.keys(ELSEWISE.dark?.terminal ?? {}).sort()).toEqual(keys);
  });
});
