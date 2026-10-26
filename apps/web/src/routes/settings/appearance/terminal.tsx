import type { Settings } from '@elsewise/bridge';
import type { SettingsSearchTerm } from '@elsewise/plugin';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/appearance/terminal')({ component: Terminal });

export const TERMINAL_TERMS = {
  theme: { label: 'Theme', keywords: ['colors', 'color scheme', 'ansi', 'palette', 'light', 'dark'] },
  font: { label: 'Font', keywords: ['font family', 'typeface', 'monospace', 'font size', 'terminal font'] },
  ligatures: { label: 'Ligatures', keywords: ['font', 'glyphs', 'monospace', 'terminal font'] },
  cursorStyle: { label: 'Cursor style', keywords: ['caret', 'block', 'underline', 'bar', 'beam'] },
  cursorBlink: { label: 'Cursor blinking', keywords: ['caret', 'blink', 'flash'] },
  scrollback: { label: 'Scrollback', keywords: ['history', 'lines', 'buffer', 'scroll'] },
} as const satisfies Record<keyof Settings['appearance']['terminal'] | 'ligatures', SettingsSearchTerm>;

export function Terminal() {
  return (
    <div className="flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-heading-lg">Terminal</h1>
    </div>
  );
}
