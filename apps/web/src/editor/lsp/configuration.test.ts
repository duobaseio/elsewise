import { describe, expect, test } from 'vitest';
import { configuration } from '@/editor/lsp/configuration';

const SETTINGS = { python: { analysis: { typeCheckingMode: 'strict' } } };

describe('configuration', () => {
  test('returns section at dotted path', () => {
    expect(configuration(SETTINGS, { items: [{ section: 'python' }, { section: 'python.analysis' }] })).toEqual([
      SETTINGS.python,
      SETTINGS.python.analysis,
    ]);
  });

  test('returns whole settings for empty section', () => {
    expect(configuration(SETTINGS, { items: [{ section: '' }, {}] })).toEqual([SETTINGS, SETTINGS]);
  });

  test('returns null for unknown section', () => {
    expect(
      configuration(SETTINGS, {
        items: [{ section: 'gopls' }, { section: 'python.missing' }, { section: 'constructor' }],
      }),
    ).toEqual([null, null, null]);
  });

  test('returns null without settings', () => {
    expect(configuration(undefined, { items: [{ section: 'python' }, {}] })).toEqual([null, null]);
  });
});
