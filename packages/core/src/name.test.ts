import { describe, expect, test } from 'vitest';
import { kebabCase } from './name';

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
