import { describe, expect, test } from 'vitest';
import { kebabCase, repositoryName } from './name';

describe('kebabCase', () => {
  test.each([
    ['My Project', 'my-project'],
    ['  spaced   out  ', 'spaced-out'],
    ['camelCaseName', 'camel-case-name'],
    ['Café Déjà_vu', 'cafe-deja-vu'],
    ['feature/login v2', 'feature-login-v2'],
    ['???', ''],
    ['', ''],
  ])('%j -> %j', (name, expected) => {
    expect(kebabCase(name)).toBe(expected);
  });
});

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
