import { BundledTheme, type InstalledPlugin, type InvalidPlugin } from '@elsewise/bridge';
import { Theme, type ThemeVariant } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import elsewise from '@/appearance/bundled/elsewise.json';
import { type LoadedTheme, resolveActiveTheme, useLoadedThemes, userThemesQuery } from '@/appearance/themes';
import { pluginsQuery } from '@/plugins/loader';

const NIGHT: LoadedTheme = {
  id: { source: 'plugin', plugin: 'com.acme.themes', id: 'night' },
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

afterEach(() => {
  vi.unstubAllGlobals();
});

// Returns the plugin `id` with `themes`.
function plugin(id: string, themes: InstalledPlugin['themes'], enabled = true): InstalledPlugin {
  return { manifest: { id, name: id, version: '1.0.0', main: 'main.js' }, enabled, themes, keymaps: [], url: '' };
}

// Returns what `useLoadedThemes` returns with `plugins` installed and the user's `themes`.
function themes(
  plugins: readonly (InstalledPlugin | InvalidPlugin)[],
  user: InstalledPlugin['themes'] = [],
): readonly LoadedTheme[] {
  const client = new QueryClient();
  client.setQueryData(pluginsQuery.queryKey, plugins);
  client.setQueryData(userThemesQuery.queryKey, user);
  let result: readonly LoadedTheme[] = [];
  function Probe() {
    result = useLoadedThemes();
    return null;
  }
  renderToString(createElement(QueryClientProvider, { client }, createElement(Probe)));
  return result;
}

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

describe('resolveActiveTheme', () => {
  test('falls back to Elsewise for unknown theme', () => {
    expect(resolveActiveTheme([NIGHT], { source: 'elsewise', id: 'dracula' }, 'dark')).toEqual(resolved(ELSEWISE.dark));
  });

  test('falls back to Elsewise for same-named theme from other plugin', () => {
    const id = { source: 'plugin', plugin: 'com.other.themes', id: 'night' } as const;

    expect(resolveActiveTheme([NIGHT], id, 'dark')).toEqual(resolved(ELSEWISE.dark));
  });

  test('falls back to Elsewise variant for missing brightness', () => {
    expect(resolveActiveTheme([NIGHT], NIGHT.id, 'light')).toEqual(resolved(ELSEWISE.light));
  });

  test('fills unspecified colors from Elsewise', () => {
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

describe('userThemesQuery', () => {
  test('returns none without bridge', async () => {
    vi.stubGlobal('window', {});

    await expect(new QueryClient().fetchQuery(userThemesQuery)).resolves.toEqual([]);
  });

  test('logs unreadable theme', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const themes = [
      { id: 'dusk', theme: NIGHT.theme },
      { id: 'dawn', error: 'dawn.json is not JSON' },
    ];
    vi.stubGlobal('window', { bridge: { settings: { loadUserThemes: async () => themes } } });

    await expect(new QueryClient().fetchQuery(userThemesQuery)).resolves.toEqual(themes);
    expect(error).toHaveBeenCalledExactlyOnceWith('Theme dawn failed to load: dawn.json is not JSON');
  });
});

describe('useLoadedThemes', () => {
  test('starts with bundled themes', () => {
    expect(themes([]).map(({ id }) => id.id)).toEqual(BundledTheme.options);
  });

  test('appends user and plugin themes', () => {
    expect(
      themes([plugin('com.acme.themes', [{ id: 'night', theme: NIGHT.theme }])], [{ id: 'dusk', theme: NIGHT.theme }]),
    ).toEqual([...themes([]), { id: { source: 'user', id: 'dusk' }, theme: NIGHT.theme }, NIGHT]);
  });

  test('skips disabled plugin', () => {
    expect(themes([plugin('com.acme.themes', [{ id: 'night', theme: NIGHT.theme }], false)])).toEqual(themes([]));
  });

  test('skips invalid plugin', () => {
    expect(themes([{ id: 'com.acme.themes', enabled: true, error: 'manifest.json does not exist' }])).toEqual(
      themes([]),
    );
  });

  test('skips unreadable themes', () => {
    expect(
      themes(
        [plugin('com.acme.themes', [{ id: 'night', error: 'night.json is not JSON' }])],
        [{ id: 'dusk', error: 'dusk.json is not JSON' }],
      ),
    ).toEqual(themes([]));
  });
});
