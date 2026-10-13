import { Code, TransportError } from '@elsewise/transport';
import { describe, expect, test } from 'vitest';
import { attempt, errnoOf, toTransportError } from './error';

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: failed`), { code });
}

describe('errnoOf', () => {
  test('returns the code of a system error', () => {
    expect(errnoOf(errno('ENOENT'))).toBe('ENOENT');
  });

  test.each([new Error('boom'), { code: 1 }, undefined])('returns nothing for %o', (error) => {
    expect(errnoOf(error)).toBeUndefined();
  });
});

describe('toTransportError', () => {
  test.each([
    ['ENOENT', Code.NOT_FOUND],
    ['EMFILE', Code.UNKNOWN],
  ])('maps %s to %s', (code, expected) => {
    const error = toTransportError(errno(code));

    expect(error.code).toBe(expected);
    expect(error.message).toBe(`${code}: failed`);
  });

  test('returns a transport error as is', () => {
    const error = new TransportError(Code.RESOURCE_EXHAUSTED, 'too big');

    expect(toTransportError(error)).toBe(error);
  });

  test('wraps a thrown value that is not an error', () => {
    const error = toTransportError('boom');

    expect(error.code).toBe(Code.UNKNOWN);
    expect(error.message).toBe('boom');
  });
});

describe('attempt', () => {
  test('returns what the operation resolves with', async () => {
    await expect(attempt(async () => 1)).resolves.toBe(1);
  });

  test('fails with the error the operation throws converted to a TransportError', async () => {
    await expect(attempt(async () => Promise.reject(errno('ENOENT')))).rejects.toMatchObject({
      name: 'TransportError',
      code: Code.NOT_FOUND,
    });
  });
});
