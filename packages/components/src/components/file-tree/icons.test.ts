import { createFileTreeIconResolver } from '@pierre/trees';
import { expect, test } from 'vitest';
import { EXTENSION_ICONS, FILENAME_ICONS } from '../../lib/file-icons.gen';
import { DEFAULT_FILE_ICONS } from '../file-icon';
import { fileTreeIcons } from './icons';

const CHEVRON = 'chevron.svg';

const FILE_TREE_ICONS = fileTreeIcons(DEFAULT_FILE_ICONS, CHEVRON);

const spriteSheet = FILE_TREE_ICONS.spriteSheet ?? '';

const definedIds = new Set([...spriteSheet.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));

const ruleIds = [
  ...Object.values(FILE_TREE_ICONS.byFileExtension ?? {}),
  ...Object.values(FILE_TREE_ICONS.byFileName ?? {}),
  ...Object.values(FILE_TREE_ICONS.remap ?? {}),
];

test('every rule points at a symbol the sheet defines', () => {
  expect(ruleIds.filter((id) => typeof id === 'string' && !definedIds.has(id))).toEqual([]);
});

test('the sheet defines no symbol no rule reaches', () => {
  expect([...definedIds].filter((id) => !ruleIds.includes(id))).toEqual([]);
});

test('every symbol id is defined exactly once', () => {
  const ids = [...spriteSheet.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
  const duplicated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  expect(duplicated).toEqual([]);
});

test('specs that draw differently never share a symbol', () => {
  const { resolveIcon } = createFileTreeIconResolver(FILE_TREE_ICONS);
  const symbolFor = (file: string) => resolveIcon('file-tree-icon-file', file).name;

  expect(symbolFor('objc.m')).not.toBe(symbolFor('objcpp.mm'));
});

test('symbol ids stay in our namespace', () => {
  expect([...definedIds].filter((id) => !id.startsWith('ew-'))).toEqual([]);
});

test('the sheet is not mistakable for the library’s own', () => {
  const builtIn = ['file-tree-icon-chevron', 'file-tree-icon-file', 'file-tree-icon-dot', 'file-tree-icon-lock'];
  expect(builtIn.filter((id) => definedIds.has(id))).toEqual([]);
});

test('the chevron draws at three quarters of its lane', () => {
  const viewBox = /<symbol id="ew-chevron" viewBox="([^"]+)"/.exec(spriteSheet)?.[1];
  if (viewBox === undefined) throw new Error('no chevron symbol');

  const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
  expect(256 / width).toBeCloseTo(0.75, 4);
  expect(height).toBeCloseTo(width, 4);
  expect(x).toBeCloseTo(-(width - 256) / 2, 4);
  expect(y).toBeCloseTo(x, 4);
});

test('no letterform outgrows the three-character budget', () => {
  const letterforms = [...Object.values(FILENAME_ICONS), ...Object.values(EXTENSION_ICONS)].filter(
    (spec) => spec.kind === 'letters',
  );
  expect(letterforms.length).toBeGreaterThan(0);
  expect(letterforms.filter((spec) => spec.letters.replace(/\s/g, '').length > 3)).toEqual([]);
});

// Unimplemented — both sizers use raw `letters.length`. Nothing carries a space, so this fires on the first.
test('letter sizing counts non-space characters', () => {
  const sized = (letters: string) => {
    return spriteSheet.match(new RegExp(`font-size: ([^;"]+)[^>]*>${letters}</text>`))?.[1];
  };

  const twoLetterSpecs = [...Object.values(FILENAME_ICONS), ...Object.values(EXTENSION_ICONS)].filter(
    (spec) => spec.kind === 'letters' && spec.letters.replace(/\s/g, '').length === 2,
  );
  const spaced = twoLetterSpecs.find((spec) => spec.kind === 'letters' && spec.letters.includes(' '));
  const plain = twoLetterSpecs.find((spec) => spec.kind === 'letters' && !spec.letters.includes(' '));

  if (spaced?.kind !== 'letters' || plain?.kind !== 'letters') return;
  expect(sized(spaced.letters)).toBe(sized(plain.letters));
});

test('a filename resolves through our rules to our symbol', () => {
  const { resolveIcon } = createFileTreeIconResolver(FILE_TREE_ICONS);
  const resolved = resolveIcon('file-tree-icon-file', 'src/main.rs');
  expect(resolved.name).toMatch(/^ew-/);
  expect(definedIds.has(resolved.name)).toBe(true);
});

test('every entry of the given file icons reaches the rules', () => {
  const icons = fileTreeIcons(
    {
      names: { ...DEFAULT_FILE_ICONS.names, makefile: { kind: 'letters', letters: 'XM', tint: null } },
      extensions: { ...DEFAULT_FILE_ICONS.extensions, rs: { kind: 'letters', letters: 'XR', tint: null } },
      fallback: { kind: 'letters', letters: 'XF', tint: null },
    },
    CHEVRON,
  );
  const { resolveIcon } = createFileTreeIconResolver(icons);
  const lettersFor = (file: string) => {
    const id = resolveIcon('file-tree-icon-file', file).name;
    return icons.spriteSheet?.match(new RegExp(`<symbol id="${id}".*?>([^<]*)</text>`))?.[1];
  };

  expect(lettersFor('Makefile')).toBe('XM');
  expect(lettersFor('makefile')).toBe('XM');
  expect(lettersFor('src/MAIN.RS')).toBe('XR');
  expect(lettersFor('src/main.rs')).toBe('XR');
  expect(lettersFor('unknown.zzz')).toBe('XF');
});

test('an overridden spec leaves no orphaned symbol behind', () => {
  const icons = fileTreeIcons(
    {
      ...DEFAULT_FILE_ICONS,
      extensions: { ...DEFAULT_FILE_ICONS.extensions, rs: { kind: 'letters', letters: 'XR', tint: null } },
    },
    CHEVRON,
  );
  const defined = [...(icons.spriteSheet ?? '').matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
  const rules = [
    ...Object.values(icons.byFileExtension ?? {}),
    ...Object.values(icons.byFileName ?? {}),
    ...Object.values(icons.remap ?? {}),
  ];

  expect(defined.filter((id) => !rules.includes(id))).toEqual([]);
});
