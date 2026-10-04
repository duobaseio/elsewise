import { describe, expect, test } from 'vitest';
import { Color, Theme } from './theme.ts';

const INVALID: [string, unknown][] = [
  ['is not an object', 'nope'],
  ['has no name', { light: {} }],
  ['has a blank name', { name: ' ', light: {} }],
  ['has neither variant', { name: 'Empty' }],
  ['has a variant that is not an object', { name: 'Bad', light: 'nope' }],
  ['has a section that is not an object', { name: 'Bad', light: { interface: [] } }],
  ['has a color that is not a color', { name: 'Bad', light: { interface: { background: 'white' } } }],
  ['has a token that is not a style', { name: 'Bad', light: { editor: { tokens: { keyword: 12 } } } }],
  [
    'has a token with a flag that is not a boolean',
    { name: 'Bad', light: { editor: { tokens: { keyword: { bold: 'yes' } } } } },
  ],
];

describe('Theme', () => {
  test('gives a variant without a section an empty one', () => {
    expect(Theme.parse({ name: 'Minimal', dark: { interface: { background: '#000000' } } })).toEqual({
      name: 'Minimal',
      dark: { interface: { background: '#000000' }, editor: {}, terminal: {} },
    });
  });

  test("turns a token's color into a style", () => {
    const tokens = { keyword: '#0000ff', comment: { color: '#888888', italic: true }, strong: { bold: true } };

    expect(Theme.parse({ name: 'Tokens', light: { editor: { tokens } } }).light?.editor.tokens).toEqual({
      keyword: { color: '#0000ff' },
      comment: { color: '#888888', italic: true },
      strong: { bold: true },
    });
  });

  test('drops unknown keys', () => {
    const light = {
      interface: { background: '#ffffff', sidebar: '#eeeeee' },
      editor: { tokens: { keyword: { color: '#0000ff', blink: true } } },
      statusBar: {},
    };

    expect(Theme.parse({ name: 'Unknown', author: 'Someone', light })).toEqual({
      name: 'Unknown',
      light: {
        interface: { background: '#ffffff' },
        editor: { tokens: { keyword: { color: '#0000ff' } } },
        terminal: {},
      },
    });
  });

  test.each(INVALID)('rejects a theme that %s', (_, theme) => {
    expect(Theme.safeParse(theme).success).toBe(false);
  });
});

describe('Color', () => {
  test.each(['#fff', '#FFFA', '#1c2430', '#1C243073', 'rgb(28, 36, 48)', 'rgba(28,36,48,.45)', 'rgba(0, 0, 0, 1)'])(
    'accepts %s',
    (color) => {
      expect(Color.safeParse(color).success).toBe(true);
    },
  );

  test.each(['white', '#ff', '#fffff', 'fff', 'rgb(28 36 48)', 'hsl(0, 0%, 0%)', 'var(--surface)', ''])(
    'rejects %s',
    (color) => {
      expect(Color.safeParse(color).success).toBe(false);
    },
  );
});
