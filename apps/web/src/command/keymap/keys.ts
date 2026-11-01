import { type Platform, parseKey } from '@elsewise/components/lib/platform';
import { base, keyName, shift } from 'w3c-keyname';

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/**
 * Returns the key that `event` presses as a keymap writes it, or null for a modifier alone.
 *
 * For example, Cmd-Shift-K on a Mac is `Mod-Shift-k`.
 */
export function recordKey(event: KeyboardEvent, platform: Platform): string | null {
  if (MODIFIERS.has(keyName(event))) {
    return null;
  }

  const keys = eventKeys(event, platform);
  const parsed = parseKey(keys[keys.length - 1] ?? '');
  if (parsed === null) {
    return null;
  }

  const primary = platform === 'mac' ? 'meta' : 'ctrl';
  return [
    ...(parsed.modifiers.has(primary) ? ['Mod'] : []),
    ...(parsed.modifiers.has('ctrl') && primary !== 'ctrl' ? ['Ctrl'] : []),
    ...(parsed.modifiers.has('meta') && primary !== 'meta' ? ['Meta'] : []),
    ...(parsed.modifiers.has('alt') ? ['Alt'] : []),
    ...(parsed.modifiers.has('shift') ? ['Shift'] : []),
    parsed.name === ' ' ? 'Space' : parsed.name,
  ].join('-');
}

/**
 * Returns the keys that `event` presses, in the order CodeMirror looks them up.
 *
 * For example, Ctrl-Shift-k presses `Ctrl-K`, then `Shift-Ctrl-k`.
 */
export function eventKeys(event: KeyboardEvent, platform: Platform): string[] {
  const named = (name: string, shifted: boolean) =>
    [
      ...(shifted && event.shiftKey ? ['Shift'] : []),
      ...(event.metaKey ? ['Meta'] : []),
      ...(event.ctrlKey ? ['Ctrl'] : []),
      ...(event.altKey ? ['Alt'] : []),
      name,
    ].join('-');

  const name = keyName(event);
  const character = [...name].length === 1 && name !== ' ';
  const keys = [named(name, !character)];
  const unshifted = base[event.keyCode];
  if (
    character &&
    (event.altKey || event.metaKey || event.ctrlKey) &&
    // Ctrl-Alt on Windows is AltGr, and Alt alone on a Mac types a character.
    !(platform === 'windows' && event.ctrlKey && event.altKey) &&
    !(platform === 'mac' && event.altKey && !(event.ctrlKey || event.metaKey)) &&
    unshifted !== undefined &&
    unshifted !== name
  ) {
    keys.push(named(unshifted, true));
    const shifted = shift[event.keyCode];
    if (event.shiftKey && shifted !== undefined && shifted !== name && shifted !== unshifted) {
      keys.push(named(shifted, false));
    }
  } else if (character && event.shiftKey) {
    keys.push(named(name, true));
  }

  return keys;
}

/**
 * Returns `key` as CodeMirror normalizes it for `platform`, or null if it is invalid.
 *
 * For example, `Alt-Mod-K` becomes `Meta-Alt-K` on a Mac and `Ctrl-Alt-K` elsewhere. Shift and a letter is the uppercase
 * letter, as the keypress names it, so `Mod-Shift-k` and `Mod-K` are the same key.
 */
export function normalizeKey(key: string, platform: Platform): string | null {
  const parsed = parseKey(key);
  if (parsed === null || !/^(?:\S|[A-Za-z][A-Za-z0-9]*)$/u.test(parsed.name)) {
    return null;
  }

  const modifiers = new Set(
    [...parsed.modifiers].map((modifier) => (modifier === 'mod' ? (platform === 'mac' ? 'meta' : 'ctrl') : modifier)),
  );
  const letter = /^[a-z]$/iu.test(parsed.name);
  return [
    ...(modifiers.has('shift') && !letter ? ['Shift'] : []),
    ...(modifiers.has('meta') ? ['Meta'] : []),
    ...(modifiers.has('ctrl') ? ['Ctrl'] : []),
    ...(modifiers.has('alt') ? ['Alt'] : []),
    parsed.name === 'Space' ? ' ' : letter && modifiers.has('shift') ? parsed.name.toUpperCase() : parsed.name,
  ].join('-');
}
