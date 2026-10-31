import { describe, expect, test } from 'vitest';
import { eventKeys, normalizeKey, recordKey } from '@/command/keymap/keys';

// Returns a keydown that presses `key`, whose key code is `keyCode`, with `modifiers` held.
function press(key: string, keyCode: number, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    type: 'keydown',
    key,
    keyCode,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  } as KeyboardEvent;
}

describe('recordKey', () => {
  test('writes primary modifier as Mod', () => {
    expect(recordKey(press('k', 75, { metaKey: true }), 'mac')).toBe('Mod-k');
    expect(recordKey(press('k', 75, { ctrlKey: true }), 'windows')).toBe('Mod-k');
    expect(recordKey(press('k', 75, { ctrlKey: true }), 'linux')).toBe('Mod-k');
  });

  test('keeps other modifier', () => {
    expect(recordKey(press('k', 75, { ctrlKey: true }), 'mac')).toBe('Ctrl-k');
    expect(recordKey(press('k', 75, { metaKey: true }), 'linux')).toBe('Meta-k');
    expect(recordKey(press('k', 75, { ctrlKey: true, altKey: true }), 'linux')).toBe('Mod-Alt-k');
  });

  test('unshifts character under modifier, naming Shift', () => {
    expect(recordKey(press('K', 75, { metaKey: true, shiftKey: true }), 'mac')).toBe('Mod-Shift-k');
    expect(recordKey(press('?', 191, { ctrlKey: true, shiftKey: true }), 'linux')).toBe('Mod-Shift-/');
  });

  test('keeps uppercase letter held with Shift alone', () => {
    expect(recordKey(press('K', 75, { shiftKey: true }), 'linux')).toBe('Shift-K');
  });

  test('keeps character typed with Option on mac', () => {
    expect(recordKey(press('˚', 75, { altKey: true }), 'mac')).toBe('Alt-˚');
  });

  test('names Space and named keys', () => {
    expect(recordKey(press(' ', 32, { ctrlKey: true }), 'linux')).toBe('Mod-Space');
    expect(recordKey(press('Enter', 13, { shiftKey: true }), 'linux')).toBe('Shift-Enter');
    expect(recordKey(press('F2', 113), 'linux')).toBe('F2');
  });

  test('matches normalized key', () => {
    const event = press('K', 75, { metaKey: true, shiftKey: true });
    const key = recordKey(event, 'mac');

    expect(key).not.toBeNull();
    expect(eventKeys(event, 'mac')).toContain(normalizeKey(key ?? '', 'mac'));
  });

  test('returns null for modifier alone', () => {
    expect(recordKey(press('Shift', 16, { shiftKey: true }), 'linux')).toBeNull();
    expect(recordKey(press('Meta', 91, { metaKey: true }), 'mac')).toBeNull();
  });
});

describe('eventKeys', () => {
  test('names character with modifiers', () => {
    expect(eventKeys(press('k', 75, { ctrlKey: true, altKey: true }), 'linux')).toEqual(['Ctrl-Alt-k']);
  });

  test('adds Shift to letter held with Shift alone', () => {
    expect(eventKeys(press('K', 75, { shiftKey: true }), 'linux')).toEqual(['K', 'Shift-K']);
  });

  test('adds unshifted character under modifier', () => {
    expect(eventKeys(press('K', 75, { metaKey: true, shiftKey: true }), 'mac')).toEqual(['Meta-K', 'Shift-Meta-k']);
    expect(eventKeys(press('?', 191, { ctrlKey: true, shiftKey: true }), 'linux')).toEqual(['Ctrl-?', 'Shift-Ctrl-/']);
  });

  test('keeps character typed with Option on mac', () => {
    expect(eventKeys(press('˚', 75, { altKey: true }), 'mac')).toEqual(['Alt-˚']);
  });

  test('keeps AltGr character on windows', () => {
    expect(eventKeys(press('@', 81, { ctrlKey: true, altKey: true }), 'windows')).toEqual(['Ctrl-Alt-@']);
  });

  test('keeps named key', () => {
    expect(eventKeys(press('Enter', 13, { shiftKey: true }), 'linux')).toEqual(['Shift-Enter']);
    expect(eventKeys(press(' ', 32, { ctrlKey: true }), 'linux')).toEqual(['Ctrl- ']);
  });

  test('matches normalized key', () => {
    const keys = eventKeys(press('K', 75, { metaKey: true, shiftKey: true }), 'mac');

    expect(keys).toContain(normalizeKey('Mod-K', 'mac'));
    expect(keys).toContain(normalizeKey('Mod-Shift-k', 'mac'));
  });
});

describe('normalizeKey', () => {
  test('folds modifier aliases', () => {
    expect(normalizeKey('Cmd-k', 'linux')).toBe('Meta-k');
    expect(normalizeKey('m-k', 'linux')).toBe('Meta-k');
    expect(normalizeKey('Control-k', 'linux')).toBe('Ctrl-k');
    expect(normalizeKey('c-k', 'linux')).toBe('Ctrl-k');
    expect(normalizeKey('a-k', 'linux')).toBe('Alt-k');
    expect(normalizeKey('s-k', 'linux')).toBe('Shift-k');
  });

  test('orders modifiers', () => {
    expect(normalizeKey('Alt-Ctrl-Meta-Shift-k', 'linux')).toBe('Shift-Meta-Ctrl-Alt-k');
  });

  test('dedupes modifiers', () => {
    expect(normalizeKey('Ctrl-Control-k', 'linux')).toBe('Ctrl-k');
  });

  test('keeps case', () => {
    expect(normalizeKey('Mod-K', 'linux')).toBe('Ctrl-K');
    expect(normalizeKey('Mod-Shift-K', 'linux')).toBe('Shift-Ctrl-K');
  });

  test('names Space', () => {
    expect(normalizeKey('Ctrl-Space', 'linux')).toBe('Ctrl- ');
  });

  test('keeps named key', () => {
    expect(normalizeKey('Shift-F6', 'linux')).toBe('Shift-F6');
    expect(normalizeKey('ArrowUp', 'linux')).toBe('ArrowUp');
  });

  test.each(['', 'Ctrl-k Ctrl-s', 'Hyper-k', 'Ctrl-', 'Ctrl-Arrow-Up', 'Ctrl- '])('rejects %j', (key) => {
    expect(normalizeKey(key, 'linux')).toBeNull();
  });

  test('resolves Mod to Meta on mac', () => {
    expect(normalizeKey('Shift-Mod-k', 'mac')).toBe('Shift-Meta-k');
  });

  test('resolves Mod to Ctrl elsewhere', () => {
    expect(normalizeKey('Shift-Mod-k', 'windows')).toBe('Shift-Ctrl-k');
    expect(normalizeKey('Shift-Mod-k', 'linux')).toBe('Shift-Ctrl-k');
  });

  test('dedupes resolved modifier', () => {
    expect(normalizeKey('Mod-Ctrl-Meta-k', 'mac')).toBe('Meta-Ctrl-k');
    expect(normalizeKey('Mod-Ctrl-Meta-k', 'linux')).toBe('Meta-Ctrl-k');
  });
});
