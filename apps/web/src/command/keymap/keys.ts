import { type Platform, parseKey } from '@elsewise/components/lib/platform';
import { base, keyName, shift } from 'w3c-keyname';

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
 * For example, `Alt-Mod-K` becomes `Meta-Alt-K` on a Mac and `Ctrl-Alt-K` elsewhere.
 */
export function normalizeKey(key: string, platform: Platform): string | null {
  const parsed = parseKey(key);
  if (parsed === null || !/^(?:\S|[A-Za-z][A-Za-z0-9]*)$/u.test(parsed.name)) {
    return null;
  }

  const modifiers = new Set(
    [...parsed.modifiers].map((modifier) => (modifier === 'mod' ? (platform === 'mac' ? 'meta' : 'ctrl') : modifier)),
  );
  return [
    ...(modifiers.has('shift') ? ['Shift'] : []),
    ...(modifiers.has('meta') ? ['Meta'] : []),
    ...(modifiers.has('ctrl') ? ['Ctrl'] : []),
    ...(modifiers.has('alt') ? ['Alt'] : []),
    parsed.name === 'Space' ? ' ' : parsed.name,
  ].join('-');
}
