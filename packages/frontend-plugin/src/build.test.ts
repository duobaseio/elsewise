import { describe, expect, test } from 'vitest';
import { peer } from './build.ts';

describe('peer', () => {
  test('matches module', () => {
    expect(peer('react')).toBe(true);
    expect(peer('react/jsx-runtime')).toBe(true);
  });

  test('matches modules under prefix', () => {
    expect(peer('@elsewise/components/components/button')).toBe(true);
    expect(peer('@elsewise/components/')).toBe(true);
  });

  test('rejects others', () => {
    expect(peer('reactive')).toBe(false);
    expect(peer('react/compiler-runtime')).toBe(false);
    expect(peer('@elsewise/components')).toBe(false);
    expect(peer('zod')).toBe(false);
  });
});
