import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { describe, expect, test } from 'vitest';
import { identity, trimMessage } from './fields';

describe('identity', () => {
  test('builds an identity', () => {
    expect(identity('Ann', 'ann@e.com', '100')).toEqual({
      name: 'Ann',
      email: 'ann@e.com',
      time: timestampFromMs(100_000),
    });
  });
});

describe('trimMessage', () => {
  test('drops only the trailing newlines of a message', () => {
    expect(trimMessage('subject\n\nbody\n\n')).toBe('subject\n\nbody');
  });
});
