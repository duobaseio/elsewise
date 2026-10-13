import { expect, test } from 'vitest';

import { formatKey, parseKey, platformFrom } from './platform';

test.each([
  ['macOS', 'mac'],
  ['MacIntel', 'mac'],
  ['Windows', 'windows'],
  ['Win32', 'windows'],
  ['Linux', 'linux'],
  ['Linux x86_64', 'linux'],
  ['Chrome OS', 'linux'],
  ['', 'linux'],
])('%s → %s', (name, platform) => {
  expect(platformFrom(name)).toBe(platform);
});

test.each([
  ['Mod-Alt-f', 'mac', '⌥⌘F'],
  ['Mod-Alt-f', 'windows', 'Ctrl Alt F'],
  ['Mod-Alt-f', 'linux', 'Ctrl Alt F'],
  ['Alt-Mod-f', 'mac', '⌥⌘F'],
  ['Shift-Enter', 'mac', '⇧↩'],
  ['Shift-Enter', 'windows', 'Shift Enter'],
  ['Enter', 'mac', '↩'],
  ['Escape', 'mac', 'Esc'],
  ['Escape', 'linux', 'Esc'],
  ['Ctrl-Shift-ArrowUp', 'mac', '⌃⇧↑'],
  ['c-s-ArrowUp', 'windows', 'Ctrl Shift ↑'],
  ['Cmd-Backspace', 'mac', '⌘⌫'],
  ['Meta-Delete', 'windows', 'Win Del'],
  ['Meta-Delete', 'linux', 'Super Del'],
  ['Mod-PageDown', 'mac', '⌘⇟'],
  ['Mod-PageDown', 'windows', 'Ctrl PgDn'],
  ['Space', 'mac', 'Space'],
  ['Mod--', 'mac', '⌘-'],
  ['Mod-K', 'mac', '⇧⌘K'],
  ['K', 'windows', 'Shift K'],
  ['F5', 'windows', 'F5'],
] as const)('%s on %s', (binding, platform, label) => {
  expect(formatKey(binding, platform)).toBe(label);
});

test('throws on an unknown modifier, like CodeMirror', () => {
  expect(() => formatKey('Hyper-f', 'mac')).toThrow('Unrecognized key: Hyper-f');
});

test.each([
  ['Mod-Shift-k', ['mod', 'shift'], 'k'],
  ['c-s-ArrowUp', ['ctrl', 'shift'], 'ArrowUp'],
  ['Cmd-Control-m-K', ['meta', 'ctrl'], 'K'],
  ['Mod--', ['mod'], '-'],
  ['Enter', [], 'Enter'],
] as const)('%s parses', (key, modifiers, name) => {
  expect(parseKey(key)).toEqual({ modifiers: new Set(modifiers), name });
});

test.each(['', 'Hyper-k', 'Ctrl-k Ctrl-s'])('%j does not parse', (key) => {
  expect(parseKey(key)).toBeNull();
});
