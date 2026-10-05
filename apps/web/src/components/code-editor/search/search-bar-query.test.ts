import { SearchQuery } from '@codemirror/search';
import { describe, expect, test } from 'vitest';
import { describe as describeMatches, LIMIT } from '@/components/code-editor/search/search-bar-query';

describe('describe', () => {
  test.each([
    ['', { total: 0, current: null, limited: false }, ''],
    ['[', { total: 0, current: null, limited: false }, ''],
    ['x', { total: 0, current: null, limited: false }, 'No results'],
    ['x', { total: 3, current: null, limited: false }, '3 results'],
    ['x', { total: 3, current: 2, limited: false }, '2/3'],
    ['x', { total: LIMIT, current: null, limited: true }, `${LIMIT}+ results`],
    ['x', { total: LIMIT, current: 7, limited: true }, `7/${LIMIT}+`],
  ])('reads %j with %j as %j', (search, matches, expected) => {
    expect(describeMatches(matches, new SearchQuery({ search, regexp: search === '[' }))).toBe(expected);
  });
});
