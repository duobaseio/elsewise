import { expect, test } from 'vitest';

import { osFrom, shortcut } from './os';

test.each([
  ['macOS', 'mac'],
  ['MacIntel', 'mac'],
  ['Windows', 'windows'],
  ['Win32', 'windows'],
  ['Linux', 'linux'],
  ['Linux x86_64', 'linux'],
  ['Chrome OS', 'linux'],
  ['', 'linux'],
])('%s → %s', (platform, os) => {
  expect(osFrom(platform)).toBe(os);
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
  ['F5', 'windows', 'F5'],
] as const)('%s on %s', (binding, os, label) => {
  expect(shortcut(binding, os)).toBe(label);
});

test('throws on an unknown modifier, like CodeMirror', () => {
  expect(() => shortcut('Hyper-f', 'mac')).toThrow('Unrecognized modifier name: Hyper');
});
