export const DEFAULT_FONTS: readonly FontChoice[] = [
  { value: null, label: 'Work Sans' },
  { value: 'Atkinson Hyperlegible Next Variable', label: 'Atkinson Hyperlegible Next' },
  { value: 'system-ui', label: 'System' },
];

export const DEFAULT_MONO_FONTS: readonly FontChoice[] = [
  { value: null, label: 'JetBrains Mono' },
  { value: 'ui-monospace', label: 'System' },
];

export interface FontChoice {
  readonly value: string | null;
  readonly label: string;
}

export function fontStack(family: string | null): string {
  const fallback = "'Work Sans Variable', system-ui, sans-serif";
  if (family === null) {
    return fallback;
  }
  return family === 'system-ui' ? 'system-ui, sans-serif' : `${JSON.stringify(family)}, ${fallback}`;
}

export function monoFontStack(family: string | null): string {
  const fallback = "'JetBrains Mono Variable', monospace";
  if (family === null) {
    return fallback;
  }
  return family === 'ui-monospace' ? 'ui-monospace, monospace' : `${JSON.stringify(family)}, ${fallback}`;
}

/**
 * Family names installed on this machine, sorted and deduplicated.
 *
 * Returns an empty list when `queryLocalFonts` is missing/permission is denied.
 */
export async function installedFonts(): Promise<readonly string[]> {
  try {
    const faces = (await window.queryLocalFonts?.()) ?? [];
    return [...new Set(faces.map((face) => face.family))].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

// Local font access is Chromium-only.
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<{ readonly family: string }[]>;
  }
}
