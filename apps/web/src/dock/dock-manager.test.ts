import { describe, expect, test } from 'vitest';
import { uniqueFileNames } from './dock-manager';

describe('uniqueFileNames', () => {
  test('names file by name', () => {
    expect(uniqueFileNames(['src/main.ts', 'src/lexer.ts'])).toEqual(
      new Map([
        ['src/main.ts', 'main.ts'],
        ['src/lexer.ts', 'lexer.ts'],
      ]),
    );
  });

  test('prefixes parent of files sharing name', () => {
    expect(uniqueFileNames(['src/routes/index.tsx', 'src/settings/index.tsx', 'src/main.ts'])).toEqual(
      new Map([
        ['src/routes/index.tsx', 'routes/index.tsx'],
        ['src/settings/index.tsx', 'settings/index.tsx'],
        ['src/main.ts', 'main.ts'],
      ]),
    );
  });

  test('keeps file in root bare', () => {
    expect(uniqueFileNames(['index.tsx', 'src/index.tsx'])).toEqual(
      new Map([
        ['index.tsx', 'index.tsx'],
        ['src/index.tsx', 'src/index.tsx'],
      ]),
    );
  });

  test('elides folders after first differing folder', () => {
    expect(
      uniqueFileNames(['src/local/a/workspace/index.tsx', 'src/remote/workspace/index.tsx', 'src/editor/index.tsx']),
    ).toEqual(
      new Map([
        ['src/local/a/workspace/index.tsx', 'local/…/index.tsx'],
        ['src/remote/workspace/index.tsx', 'remote/…/index.tsx'],
        ['src/editor/index.tsx', 'editor/index.tsx'],
      ]),
    );
  });

  test('prefixes parent of file whose path ends another', () => {
    expect(uniqueFileNames(['src/index.tsx', 'apps/src/index.tsx'])).toEqual(
      new Map([
        ['src/index.tsx', 'src/index.tsx'],
        ['apps/src/index.tsx', 'apps/…/index.tsx'],
      ]),
    );
  });

  test('names files by path when first differing folders are shared', () => {
    expect(uniqueFileNames(['a/q/x/index.tsx', 'a/r/x/index.tsx', 'b/x/index.tsx'])).toEqual(
      new Map([
        ['a/q/x/index.tsx', 'a/q/x/index.tsx'],
        ['a/r/x/index.tsx', 'a/r/x/index.tsx'],
        ['b/x/index.tsx', 'b/…/index.tsx'],
      ]),
    );
  });
});
