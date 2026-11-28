import { describe, expect, test } from 'vitest';
import { repositoryName } from './name';

describe('repositoryName', () => {
  test.each([
    ['https://github.com/duobase/elsewise.git', 'elsewise'],
    ['https://github.com/duobase/elsewise', 'elsewise'],
    ['https://github.com/duobase/elsewise/', 'elsewise'],
    ['git@github.com:duobase/elsewise.git', 'elsewise'],
    ['/tmp/repos/local.git', 'local'],
    ['C:\\repos\\local', 'local'],
    ['https://github.com/duobase/..', ''],
    ['https://github.com/duobase/./', ''],
    ['', ''],
  ])('%j -> %j', (url, expected) => {
    expect(repositoryName(url)).toBe(expected);
  });
});
