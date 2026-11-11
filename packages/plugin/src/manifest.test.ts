import { describe, expect, test } from 'vitest';
import { Manifest } from './manifest';

const MINIMAL = { id: 'io.example', name: 'Example', version: '1.0.0', elsewise: '^1.0.0' };

const INVALID: [string, unknown][] = [
  ['is not an object', 'nope'],
  ['has an id that is not a path segment', { ...MINIMAL, id: '../io.example', frontend: {} }],
  ['has a blank name', { ...MINIMAL, name: ' ', frontend: {} }],
  ['has a name on two lines', { ...MINIMAL, name: 'Git\nfor Elsewise', frontend: {} }],
  ['has a name over 50 characters', { ...MINIMAL, name: 'a'.repeat(51), frontend: {} }],
  ['has a version that is not SemVer', { ...MINIMAL, version: '1.0', frontend: {} }],
  ['has a version with build metadata', { ...MINIMAL, version: '1.0.0+build', frontend: {} }],
  ['has no host range', { id: 'io.example', name: 'Example', version: '1.0.0', frontend: {} }],
  ['has a host range that is not a range', { ...MINIMAL, elsewise: '1.0.0.0', frontend: {} }],
  ['has neither part', MINIMAL],
  ['has only a daemon part', { ...MINIMAL, daemon: {} }],
  ['has a part that is not an object', { ...MINIMAL, frontend: 'main.js' }],
  ['has a part with a blank main', { ...MINIMAL, frontend: { main: ' ' } }],
  ['has a part with a pairing range that is not a range', { ...MINIMAL, frontend: { daemon: '>1.2.0.0' } }],
  [
    'has a dependency whose id is not a path segment',
    { ...MINIMAL, frontend: {}, daemon: { dependencies: { '../io': '^1' } } },
  ],
  [
    'has a dependency with a range that is not a range',
    { ...MINIMAL, frontend: {}, daemon: { dependencies: { 'io.example.git': 'latest' } } },
  ],
  ['has a blank description', { ...MINIMAL, description: ' ', frontend: {} }],
  ['has a description on two lines', { ...MINIMAL, description: 'Git\nfor Elsewise', frontend: {} }],
  ['has a description over 200 characters', { ...MINIMAL, description: 'a'.repeat(201), frontend: {} }],
  ['has a homepage that is not a URL', { ...MINIMAL, homepage: 'example.com', frontend: {} }],
  ['has a homepage that is not an HTTP URL', { ...MINIMAL, homepage: 'ftp://example.com/git', frontend: {} }],
  ['has a repository that is not an HTTP URL', { ...MINIMAL, repository: 'git@github.com:example/git', frontend: {} }],
  [
    'has a repository in the form of an object',
    { ...MINIMAL, repository: { type: 'git', url: 'https://github.com/example/git' }, frontend: {} },
  ],
  ['has issues that is not an HTTP URL', { ...MINIMAL, issues: 'mailto:issues@example.com', frontend: {} }],
  ['has a blank license', { ...MINIMAL, license: ' ', frontend: {} }],
  ['has a license that is not an SPDX expression', { ...MINIMAL, license: 'MIT/Apache-2.0', frontend: {} }],
  ['has a license over 100 characters', { ...MINIMAL, license: 'a'.repeat(101), frontend: {} }],
  ['has topics that is not an array', { ...MINIMAL, topics: 'git', frontend: {} }],
  ['has a topic in uppercase', { ...MINIMAL, topics: ['Git'], frontend: {} }],
  ['has a topic with a space', { ...MINIMAL, topics: ['version control'], frontend: {} }],
  ['has a topic that starts with a hyphen', { ...MINIMAL, topics: ['-git'], frontend: {} }],
  ['has a blank topic', { ...MINIMAL, topics: [''], frontend: {} }],
  ['has a topic over 50 characters', { ...MINIMAL, topics: ['a'.repeat(51)], frontend: {} }],
  ['has over 20 topics', { ...MINIMAL, topics: Array.from({ length: 21 }, (_, i) => `topic-${i}`), frontend: {} }],
  ['has a topic twice', { ...MINIMAL, topics: ['git', 'git'], frontend: {} }],
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
  'v1.0.0',
];

const NOT_RANGES = ['', ' ', '1.0.0.0', '01.0.0', '>1.2.0.0', '1.2.3 -2.3.4', 'latest'];

describe('Manifest', () => {
  test('gives daemon part without main the default', () => {
    expect(Manifest.parse({ ...MINIMAL, frontend: {}, daemon: {} })).toEqual({
      ...MINIMAL,
      frontend: {},
      daemon: { main: 'main.js' },
    });
  });

  test('keeps frontend part without main without one', () => {
    expect(Manifest.parse({ ...MINIMAL, frontend: {} })).toEqual({ ...MINIMAL, frontend: {} });
  });

  test('keeps pairing ranges and dependencies', () => {
    const frontend = { main: 'index.js', daemon: '^1.3.0', dependencies: { 'io.example.git': '^2.1.0' } };
    const daemon = { frontend: '^1.2.0', dependencies: { 'io.example.git': '^2.0.0' } };

    expect(Manifest.parse({ ...MINIMAL, version: '1.4.0-beta.1', frontend, daemon })).toEqual({
      ...MINIMAL,
      version: '1.4.0-beta.1',
      frontend,
      daemon: { main: 'main.js', ...daemon },
    });
  });

  test('keeps listing metadata', () => {
    const listing = {
      description: 'Git for Elsewise',
      homepage: 'https://example.com/git',
      repository: 'https://github.com/example/git',
      issues: 'http://github.com/example/git/issues',
      license: '(MIT OR Apache-2.0) AND LicenseRef-Fonts',
      topics: ['git', 'version-control', '3-way-merge'],
    };

    expect(Manifest.parse({ ...MINIMAL, ...listing, frontend: {} })).toEqual({ ...MINIMAL, ...listing, frontend: {} });
  });

  test.each(['http://localhost:3000', 'http://127.0.0.1/git', 'https://intranet/git'])(
    'accepts homepage %j',
    (homepage) => {
      expect(Manifest.safeParse({ ...MINIMAL, homepage, frontend: {} }).success).toBe(true);
    },
  );

  test('keeps empty topics', () => {
    expect(Manifest.parse({ ...MINIMAL, topics: [], frontend: {} })).toEqual({
      ...MINIMAL,
      topics: [],
      frontend: {},
    });
  });

  test('drops unknown keys', () => {
    expect(Manifest.parse({ ...MINIMAL, author: 'Joe', frontend: {}, daemon: { entry: 'x.js' } })).toEqual({
      ...MINIMAL,
      frontend: {},
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
});
