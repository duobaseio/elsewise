import { Code, TransportError } from '@elsewise/transport';
import { describe, expect, test } from 'vitest';
import {
  filePath,
  guardOperand,
  guardRefName,
  mainline,
  pathspecs,
  revisionOrHead,
  revisions,
  withPathspecs,
} from './args';

function thrown(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error('nothing was thrown');
}

describe('guardOperand', () => {
  test('returns a valid operands', () => {
    expect(guardOperand('feature/x', 'branch')).toBe('feature/x');
    expect(guardOperand('a-b', 'branch')).toBe('a-b');
  });

  test.each(['', '-', '--all', 'a\0b'])('refuses %j', (value) => {
    expect(thrown(() => guardOperand(value, 'branch'))).toMatchObject({
      name: 'TransportError',
      code: Code.INVALID_ARGUMENT,
      message: `"${value}" is not a valid branch`,
    });
  });
});

describe('guardRefName', () => {
  test('refuses a colon on top of guardOperand', () => {
    expect(guardRefName('feature/x', 'branch name')).toBe('feature/x');
    expect(thrown(() => guardRefName('main:refs/heads/protected', 'branch name'))).toMatchObject({
      name: 'TransportError',
      code: Code.INVALID_ARGUMENT,
      message: '"main:refs/heads/protected" is not a valid branch name',
    });
    expect(thrown(() => guardRefName('--all', 'branch name'))).toBeInstanceOf(TransportError);
  });
});

describe('revisionOrHead', () => {
  test('stands in HEAD for an empty revision', () => {
    expect(revisionOrHead('')).toBe('HEAD');
    expect(revisionOrHead('v1')).toBe('v1');
    expect(thrown(() => revisionOrHead('--not'))).toBeInstanceOf(TransportError);
  });
});

describe('revisions', () => {
  test('guards each revision and refuses none', () => {
    expect(revisions(['v1', 'main'])).toEqual(['v1', 'main']);
    expect(thrown(() => revisions(['v1', '--not']))).toBeInstanceOf(TransportError);
    expect(thrown(() => revisions([]))).toMatchObject({
      code: Code.INVALID_ARGUMENT,
      message: 'at least one revision is needed',
    });
  });
});

describe('mainline', () => {
  test('returns the parent unless it is 0', () => {
    expect(mainline(0)).toEqual([]);
    expect(mainline(2)).toEqual(['--mainline=2']);
  });
});

describe('pathspecs', () => {
  test('makes each path a literal pathspec', () => {
    expect(pathspecs(['a/b.txt', 'c'])).toEqual([':(literal)a/b.txt', ':(literal)c']);
  });

  test('covers everything when there is no path or one names the root', () => {
    expect(pathspecs([])).toEqual([]);
    expect(pathspecs(['a.txt', ''])).toEqual([]);
  });

  test('refuses a path that leaves the root', () => {
    expect(thrown(() => pathspecs(['../x']))).toMatchObject({ code: Code.INVALID_ARGUMENT });
  });
});

describe('filePath', () => {
  test('joins the segments and refuses the root', () => {
    expect(filePath('a/b.txt')).toBe('a/b.txt');
    expect(thrown(() => filePath(''))).toMatchObject({ code: Code.INVALID_ARGUMENT });
  });
});

describe('withPathspecs', () => {
  test('appends the pathspecs', () => {
    expect(withPathspecs(['add'], [':(literal)a'])).toEqual(['add', '--', ':(literal)a']);
  });

  test('appends . to represent everything and nothing when pathspecs is undefined.', () => {
    expect(withPathspecs(['add'], [])).toEqual(['add', '--', '.']);
    expect(withPathspecs(['add'], undefined)).toEqual(['add']);
  });
});
