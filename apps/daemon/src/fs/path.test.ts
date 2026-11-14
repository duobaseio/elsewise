import path from 'node:path';
import { Code } from '@elsewise/transport';
import { describe, expect, test } from 'vitest';
import { parseProtocolPath, toNativeAbsolutePath, toNativePath, toNativePathOrRoot, toProtocolPath } from './path';

const windows = path.sep === '\\';
const root = windows ? 'C:\\work' : '/work';
const invalid = expect.objectContaining({ code: Code.INVALID_ARGUMENT });

describe('toNativeAbsolutePath', () => {
  test('returns an absolute path as a native path', () => {
    expect(toNativeAbsolutePath(path.join(root, 'a.txt'))).toBe(path.join(root, 'a.txt'));
  });

  test.each(['', 'relative/a.txt', `${root}\0`])('refuses the path %j', (value) => {
    expect(() => toNativeAbsolutePath(value)).toThrow(invalid);
  });
});

describe('parseProtocolPath', () => {
  test.each([
    ['', []],
    ['a.txt', ['a.txt']],
    ['src/a.ts', ['src', 'a.ts']],
    ['src/components', ['src', 'components']],
    ['.hidden/..a', ['.hidden', '..a']],
  ])('splits %j into %j', (relative, segments) => {
    expect(parseProtocolPath(relative)).toEqual(segments);
  });

  test.each(['../outside', 'a/../b', './a', 'a//b', '/a', 'a/', 'a\0b'])('refuses %j', (relative) => {
    expect(() => parseProtocolPath(relative)).toThrow(invalid);
  });

  test.runIf(windows).each(['a\\b', 'c:'])('refuses %j on Windows', (relative) => {
    expect(() => parseProtocolPath(relative)).toThrow(invalid);
  });
});

describe('toNativePathOrRoot', () => {
  test('joins the root and the path natively', () => {
    expect(toNativePathOrRoot(root, 'src/a.ts')).toBe(path.join(root, 'src', 'a.ts'));
    expect(toNativePathOrRoot(root, '')).toBe(root);
  });

  test('takes path as absolute without root', () => {
    expect(toNativePathOrRoot('', path.join(root, 'a.txt'))).toBe(path.join(root, 'a.txt'));
  });

  test.each(['', 'a.txt'])('refuses %j without root', (relative) => {
    expect(() => toNativePathOrRoot('', relative)).toThrow(invalid);
  });
});

describe('toNativePath', () => {
  test('refuses the root itself', () => {
    expect(toNativePath(root, 'a.txt')).toBe(path.join(root, 'a.txt'));
    expect(() => toNativePath(root, '')).toThrow(invalid);
  });
});

describe('toProtocolPath', () => {
  test('separates with slashes', () => {
    expect(toProtocolPath(path.join('src', 'a.ts'))).toBe('src/a.ts');
  });
});
