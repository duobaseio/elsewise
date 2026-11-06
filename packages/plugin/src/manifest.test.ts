import { validRange } from 'semver';
import { describe, expect, test } from 'vitest';
import { Manifest } from './manifest';

const MINIMAL = { id: 'io.example', name: 'Example', version: '1.0.0', elsewise: '^1.0.0' };

const INVALID: [string, unknown][] = [
  ['is not an object', 'nope'],
  ['has an id that is not a path segment', { ...MINIMAL, id: '../io.example', frontend: {} }],
  ['has a blank name', { ...MINIMAL, name: ' ', frontend: {} }],
  ['has a version that is not SemVer', { ...MINIMAL, version: '1.0', frontend: {} }],
  ['has no host range', { id: 'io.example', name: 'Example', version: '1.0.0', frontend: {} }],
  ['has a host range that is not a range', { ...MINIMAL, elsewise: 'v1.0.0', frontend: {} }],
  ['has neither part', MINIMAL],
  ['has a part that is not an object', { ...MINIMAL, frontend: 'main.js' }],
  ['has a part with a blank main', { ...MINIMAL, frontend: { main: ' ' } }],
  ['has a part with a pairing range that is not a range', { ...MINIMAL, frontend: { daemon: '^v1.0.0' } }],
  ['has a dependency whose id is not a path segment', { ...MINIMAL, daemon: { dependencies: { '../io': '^1' } } }],
  [
    'has a dependency with a range that is not a range',
    { ...MINIMAL, daemon: { dependencies: { 'io.example.git': '||' } } },
  ],
];

const RANGES = [
  '^1.2.0',
  '~1.2',
  '1.0',
  '>=1.2.3 <2.0.0',
  '>= 1.2.3',
  '1.2.3 - 2.3.4',
  '1.x',
  '1.2.*',
  '*',
  '1.0.0-beta.1+build.5',
  '^1.0.0 || ^2.0.0',
  ' ^1.0.0 ',
];

const NOT_RANGES = [
  '',
  ' ',
  '1.0.0.0',
  '01.0.0',
  'v1.0.0',
  '>1.2.0.0',
  '^v1.0.0',
  '1.2.3 -2.3.4',
  '||',
  '^1.0.0 ||',
  'latest',
];

describe('Manifest', () => {
  test('gives daemon part without main the default', () => {
    expect(Manifest.parse({ ...MINIMAL, daemon: {} })).toEqual({ ...MINIMAL, daemon: { main: 'main.js' } });
  });

  test('keeps frontend part without main without one', () => {
    expect(Manifest.parse({ ...MINIMAL, frontend: {} })).toEqual({ ...MINIMAL, frontend: {} });
  });

  test('keeps pairing ranges and dependencies', () => {
    const frontend = { main: 'index.js', daemon: '^1.3.0', dependencies: { 'io.example.git': '^2.1.0' } };
    const daemon = { frontend: '^1.2.0', dependencies: { 'io.example.git': '^2.0.0' } };

    expect(Manifest.parse({ ...MINIMAL, version: '1.4.0-beta.1+build', frontend, daemon })).toEqual({
      ...MINIMAL,
      version: '1.4.0-beta.1+build',
      frontend,
      daemon: { main: 'main.js', ...daemon },
    });
  });

  test('drops unknown keys', () => {
    expect(Manifest.parse({ ...MINIMAL, author: 'Joe', daemon: { entry: 'x.js' } })).toEqual({
      ...MINIMAL,
      daemon: { main: 'main.js' },
    });
  });

  test.each(INVALID)('rejects manifest that %s', (_, manifest) => {
    expect(Manifest.safeParse(manifest).success).toBe(false);
  });

  test.each(RANGES)('accepts range %j', (range) => {
    expect(Manifest.safeParse({ ...MINIMAL, elsewise: range, frontend: {} }).success).toBe(true);
  });

  test.each(NOT_RANGES)('rejects range %j', (range) => {
    expect(Manifest.safeParse({ ...MINIMAL, elsewise: range, frontend: {} }).success).toBe(false);
  });

  // The hosts check ranges with semver, which must parse every range the manifest accepts.
  test.each(RANGES)('accepts range %j that semver parses', (range) => {
    expect(validRange(range)).not.toBeNull();
  });
});
