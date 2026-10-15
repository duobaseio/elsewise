export type Platform = 'mac' | 'windows' | 'linux';

/** The current detected platform. */
export const PLATFORM: Platform = platformFrom(
  (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ?? navigator.platform,
);

/**
 * A modifier in CodeMirror's notation. `mod` is Cmd on macOS and Ctrl elsewhere.
 */
export type Modifier = 'mod' | 'ctrl' | 'alt' | 'shift' | 'meta';

const ALIASES: Record<string, Modifier> = {
  mod: 'mod',
  ctrl: 'ctrl',
  control: 'ctrl',
  c: 'ctrl',
  cmd: 'meta',
  meta: 'meta',
  m: 'meta',
  alt: 'alt',
  a: 'alt',
  shift: 'shift',
  s: 'shift',
};

const ORDER: readonly Exclude<Modifier, 'mod'>[] = ['ctrl', 'alt', 'shift', 'meta'];

const MODIFIERS: Record<Platform, Record<Exclude<Modifier, 'mod'>, string>> = {
  mac: { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' },
  windows: { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' },
  linux: { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Super' },
};

const KEYS: Record<Platform, Record<string, string>> = {
  mac: {
    Enter: '↩',
    Escape: 'Esc',
    Backspace: '⌫',
    Delete: '⌦',
    Tab: '⇥',
    Home: '↖',
    End: '↘',
    PageUp: '⇞',
    PageDown: '⇟',
  },
  windows: { Escape: 'Esc', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn' },
  linux: { Escape: 'Esc', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn' },
};

const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

export function platformFrom(name: string): Platform {
  if (/^mac/i.test(name)) {
    return 'mac';
  }

  if (/^win/i.test(name)) {
    return 'windows';
  }

  return 'linux';
}

/**
 * A `key` such as `Mod-Alt-f` or `Shift-Enter` in the platform's notation: `⌥ ⌘ F` on a Mac, `Ctrl Alt F` elsewhere.
 */
export function formatKey(key: string, platform: Platform = PLATFORM): string {
  const parsed = parseKey(key);
  if (parsed === null) {
    throw new Error(`Unrecognized key: ${key}`);
  }

  const { name } = parsed;
  const modifiers = new Set(
    [...parsed.modifiers].map((modifier) => (modifier === 'mod' ? (platform === 'mac' ? 'meta' : 'ctrl') : modifier)),
  );
  // Shows Shift for an uppercase letter since CodeMirror runs `Mod-K` on Mod-Shift-k.
  if ([...name].length === 1 && name !== name.toLowerCase()) {
    modifiers.add('shift');
  }

  return [
    ...ORDER.filter((modifier) => modifiers.has(modifier)).map((modifier) => MODIFIERS[platform][modifier]),
    KEYS[platform][name] ?? ARROWS[name] ?? (name.length === 1 ? name.toUpperCase() : name),
  ].join(platform === 'mac' ? '' : ' ');
}

/**
 * Splits a `key` in CodeMirror's notation, e.g. `Mod-Shift-k` or `c-s-ArrowUp`, into its modifiers and name.
 *
 * Returns null if `key` is empty or a modifier is unknown.
 */
export function parseKey(key: string): { modifiers: ReadonlySet<Modifier>; name: string } | null {
  const parts = key.split(/-(?!$)/);
  const name = parts.pop() ?? '';
  if (name === '') {
    return null;
  }

  const modifiers = new Set<Modifier>();
  for (const part of parts) {
    const modifier = ALIASES[part.toLowerCase()];
    if (modifier === undefined) {
      return null;
    }

    modifiers.add(modifier);
  }

  return { modifiers, name };
}
