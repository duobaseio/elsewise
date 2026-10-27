import { BundledTheme } from '@elsewise/bridge';
import { Theme, type ThemeVariant } from '@elsewise/plugin';
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

// Returns `variant` with the scrollbar markers' and diff's colors it resolves to, which it leaves to the interface's.
function resolved(variant: ThemeVariant | undefined) {
  const colors = variant?.interface ?? {};
  return {
    ...variant,
    editor: {
      ...variant?.editor,
      scrollbarMarkers: {
        error: colors.error,
        warning: colors['warning-fill'],
        info: colors.info,
        hint: colors.disabled,
        searchMatch: variant?.editor.searchMatch,
        usage: colors['info-line'],
      },
      diff: {
        addedLine: colors['success-wash'],
        addedText: colors['success-line'],
        addedGutter: colors['success-line'],
        deletedLine: colors['error-wash'],
        deletedText: colors['error-line'],
        deletedGutter: colors['error-line'],
        ...variant?.editor.diff,
      },
    },
  };
}

describe('THEMES', () => {
  test('loads every bundled theme', () => {
    expect(THEMES.map(({ id }) => id.name)).toEqual(BundledTheme.options);
  });
});

describe('resolveActiveTheme', () => {
  test("returns Elsewise's colors for unknown theme", () => {
    expect(resolveActiveTheme([NIGHT], { source: 'elsewise', name: 'dracula' }, 'dark')).toEqual(
      resolved(ELSEWISE.dark),
    );
  });

  test("returns Elsewise's colors for same-named theme from another plugin", () => {
    const id = { source: 'plugin', plugin: 'com.other.themes', name: 'night' } as const;

    expect(resolveActiveTheme([NIGHT], id, 'dark')).toEqual(resolved(ELSEWISE.dark));
  });

  test("returns Elsewise's variant for theme without one for brightness", () => {
    expect(resolveActiveTheme([NIGHT], NIGHT.id, 'light')).toEqual(resolved(ELSEWISE.light));
  });

  test("fills unspecified colors with Elsewise's", () => {
    expect(resolveActiveTheme([NIGHT], NIGHT.id, 'dark')).toEqual({
      interface: { ...ELSEWISE.dark?.interface, background: '#000000', foreground: '#eeeeee' },
      editor: {
        ...resolved(ELSEWISE.dark).editor,
        background: '#010101',
        // Night's own interface colors, which are Elsewise's, rather than Elsewise's diff.
        diff: {
          addedLine: ELSEWISE.dark?.interface['success-wash'],
          addedText: ELSEWISE.dark?.interface['success-line'],
          addedGutter: ELSEWISE.dark?.interface['success-line'],
          deletedLine: ELSEWISE.dark?.interface['error-wash'],
          deletedText: ELSEWISE.dark?.interface['error-line'],
          deletedGutter: ELSEWISE.dark?.interface['error-line'],
        },
        tokens: { ...ELSEWISE.dark?.editor.tokens, keyword: { color: '#ff0000' }, punctuation: { bold: true } },
      },
      terminal: { ...ELSEWISE.dark?.terminal, red: '#ff5555' },
    });
  });

  test('fills unspecified scrollbar markers from interface colors', () => {
    const theme: LoadedTheme = {
      ...NIGHT,
      theme: {
        name: 'Night',
        dark: {
          interface: { error: '#ff0000', 'warning-fill': '#ffff00' },
          editor: { scrollbarMarkers: { error: '#880000' } },
          terminal: {},
        },
      },
    };

    expect(resolveActiveTheme([theme], theme.id, 'dark').editor.scrollbarMarkers).toMatchObject({
      error: '#880000',
      warning: '#ffff00',
      info: ELSEWISE.dark?.interface.info,
    });
  });

  test('fills unspecified diff colors from interface colors', () => {
    const theme: LoadedTheme = {
      ...NIGHT,
      theme: {
        name: 'Night',
        dark: {
          interface: { 'success-wash': '#002200', 'error-line': '#ff0000' },
          editor: { diff: { deletedLine: '#220000' } },
          terminal: {},
        },
      },
    };

    expect(resolveActiveTheme([theme], theme.id, 'dark').editor.diff).toMatchObject({
      addedLine: '#002200',
      addedText: ELSEWISE.dark?.interface['success-line'],
      deletedLine: '#220000',
      deletedGutter: '#ff0000',
    });
  });
});
