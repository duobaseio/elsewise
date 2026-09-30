export type Os = 'mac' | 'windows' | 'linux';

/** The current detected operating system. */
export const OS: Os = osFrom(
  (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ?? navigator.platform,
);

type Modifier = 'ctrl' | 'alt' | 'shift' | 'meta';

const ORDER: readonly Modifier[] = ['ctrl', 'alt', 'shift', 'meta'];

const MODIFIERS: Record<Os, Record<Modifier, string>> = {
  mac: { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' },
  windows: { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' },
  linux: { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Super' },
};

const KEYS: Record<Os, Record<string, string>> = {
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

export function osFrom(platform: string): Os {
  if (/^mac/i.test(platform)) {
    return 'mac';
  }

  if (/^win/i.test(platform)) {
    return 'windows';
  }

  return 'linux';
}

/**
 * A key binding such as `Mod-Alt-f` or `Shift-Enter` in the platform's notation: `⌥ ⌘ F` on a Mac, `Ctrl Alt F` elsewhere.
 */
export function shortcut(binding: string, os: Os = OS): string {
  const parts = binding.split(/-(?!$)/);
  const key = parts[parts.length - 1] ?? '';
  const modifiers = new Set<Modifier>();

  for (const part of parts.slice(0, -1)) {
    if (/^(cmd|meta|m)$/i.test(part)) {
      modifiers.add('meta');
    } else if (/^a(lt)?$/i.test(part)) {
      modifiers.add('alt');
    } else if (/^(c|ctrl|control)$/i.test(part)) {
      modifiers.add('ctrl');
    } else if (/^s(hift)?$/i.test(part)) {
      modifiers.add('shift');
    } else if (/^mod$/i.test(part)) {
      modifiers.add(os === 'mac' ? 'meta' : 'ctrl');
    } else {
      throw new Error(`Unrecognized modifier name: ${part}`);
    }
  }

  return [
    ...ORDER.filter((modifier) => modifiers.has(modifier)).map((modifier) => MODIFIERS[os][modifier]),
    KEYS[os][key] ?? ARROWS[key] ?? (key.length === 1 ? key.toUpperCase() : key),
  ].join(os === 'mac' ? '' : ' ');
}
