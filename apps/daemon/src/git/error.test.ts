import { Code, TransportError } from '@elsewise/transport';
import { describe, expect, test } from 'vitest';
import { attempt, GitError, gitToTransportError } from './error';

describe('GitError', () => {
  test('cleans the stderr and stores it as a message', () => {
    const stderr = 'fatal: not a repository\nhint: run git init\nerror: second \n\nwarning: third\n';
    const failure = new GitError(128, stderr, '');
    expect(failure).toMatchObject({ name: 'GitError', exitCode: 128 });
    expect(failure.message).toBe('not a repository\nsecond\nthird');
  });

  test('falls back to stdout followed by the exit code', () => {
    // Hints are cleaned and `GitError` should fall back to stdout.
    expect(new GitError(1, 'hint: only hints\n', 'nothing to commit').message).toBe('nothing to commit');
    expect(new GitError(1, '', '').message).toBe('git exited with 1');
    expect(new GitError(null, '', '').message).toBe('git exited with a signal');
  });
});

describe('gitToTransportError', () => {
  test('returns a transport error as is', () => {
    const error = new TransportError(Code.CANCELLED, 'cancelled');
    expect(gitToTransportError(error)).toBe(error);
  });

  test('makes a git failure FAILED_PRECONDITION carrying its message', () => {
    expect(gitToTransportError(new GitError(1, 'error: no\n', ''))).toMatchObject({
      name: 'TransportError',
      code: Code.FAILED_PRECONDITION,
      message: 'no',
    });
  });

  test('maps any other errors including file system errors', () => {
    const missing = Object.assign(new Error('ENOENT: gone'), { code: 'ENOENT' });
    expect(gitToTransportError(missing)).toMatchObject({ code: Code.NOT_FOUND, message: 'ENOENT: gone' });
    expect(gitToTransportError('boom')).toMatchObject({ code: Code.UNKNOWN, message: 'boom' });
  });
});

describe('attempt', () => {
  test('returns what the operation resolves with', async () => {
    await expect(attempt(async () => 1)).resolves.toBe(1);
  });

  test('fails with the thrown error converted', async () => {
    const operation = async () => {
      throw new GitError(1, 'error: no\n', '');
    };
    await expect(attempt(operation)).rejects.toMatchObject({ name: 'TransportError', code: Code.FAILED_PRECONDITION });
  });
});
