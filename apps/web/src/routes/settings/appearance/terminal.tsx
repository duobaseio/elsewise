import type { CursorStyle, Settings } from '@elsewise/bridge';
import { Input } from '@elsewise/components/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Separator } from '@elsewise/components/components/separator';
import { Row, SplitPage } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import { PLATFORM } from '@elsewise/components/lib/platform';
import type { SettingsSearchTerm } from '@elsewise/plugin';
import { createFileRoute } from '@tanstack/react-router';
import type { ITerminalAddon } from '@xterm/xterm';
import { useState } from 'react';
import { DEFAULT_MONO_FONTS, monoFontStack } from '@/settings/fonts';
import { useSettings, useUpdateSettings } from '@/settings/settings';
import { Terminal as TerminalView } from '@/terminal/terminal';
import { FontRows } from '../-font-rows';
import { LineHeightInput } from '../-line-height-input';
import { ThemeSelect } from './-theme';

export const Route = createFileRoute('/settings/appearance/terminal')({ component: Terminal });

export const TERMINAL_TERMS = {
  theme: { label: 'Theme', keywords: ['colors', 'color scheme', 'ansi', 'palette', 'light', 'dark'] },
  font: { label: 'Font', keywords: ['font family', 'typeface', 'monospace', 'font size', 'terminal font'] },
  lineHeight: { label: 'Line height', keywords: ['line spacing', 'leading', 'row height', 'terminal font'] },
  ligatures: { label: 'Ligatures', keywords: ['font', 'glyphs', 'monospace', 'terminal font'] },
  cursorStyle: { label: 'Cursor style', keywords: ['caret', 'block', 'underline', 'bar', 'beam'] },
  cursorBlink: { label: 'Cursor blinking', keywords: ['caret', 'blink', 'flash'] },
  copyOnSelect: { label: 'Copy on select', keywords: ['clipboard', 'selection', 'auto copy'] },
  ...(PLATFORM === 'mac' && {
    macOptionClickForcesSelection: {
      label: 'Option-click to select',
      keywords: ['alt', 'mouse', 'selection', 'tmux', 'vim'],
    },
    macOptionIsMeta: { label: 'Option as Meta', keywords: ['alt', 'keyboard', 'emacs', 'readline'] },
  }),
  scrollback: { label: 'Scrollback', keywords: ['history', 'lines', 'buffer', 'scroll'] },
} as const satisfies Partial<
  Record<keyof Settings['appearance']['terminal'] | 'lineHeight' | 'ligatures', SettingsSearchTerm>
>;

const CURSOR_STYLES: Record<CursorStyle, string> = { block: 'Block', underline: 'Underline', bar: 'Bar' };

const SCROLLBACK_LIMIT = { min: 1000, max: 100000 } as const;

const PROMPT = '\x1b[32m➜\x1b[0m \x1b[36melsewise\x1b[0m \x1b[35mgit:(main)\x1b[0m ';

const TRANSCRIPT = [
  `${PROMPT}ls`,
  '\x1b[1;34mapps\x1b[0m  \x1b[1;34mdaemon\x1b[0m  \x1b[1;34mproto\x1b[0m  Makefile  README.md',
  '',
  `${PROMPT}git remote get-url origin`,
  'https://github.com/duobaseio/elsewise',
  '',
  `${PROMPT}git status --short`,
  ' \x1b[33mM\x1b[0m apps/web/src/styles.css',
  '\x1b[31m??\x1b[0m apps/web/src/terminal/',
  '',
  `${PROMPT}make check`,
  'cargo check --workspace  \x1b[32mok\x1b[0m',
  'pnpm --filter web test   \x1b[32m104 passed\x1b[0m, \x1b[33m2 skipped\x1b[0m',
  '\x1b[1;33mwarning\x1b[0m: unused import `foo`  \x1b[2mdaemon/src/main.rs:12\x1b[0m',
  '\x1b[1;31merror\x1b[0m: mismatched types  \x1b[2mdaemon/src/main.rs:40\x1b[0m',
  '',
  PROMPT,
].join('\r\n');

const PREVIEW: ITerminalAddon = {
  activate: (terminal) => terminal.write(TRANSCRIPT),
  dispose() {},
};

export function Terminal() {
  const terminal = useSettings((settings) => settings.appearance.terminal);
  const update = useUpdateSettings();
  const set = (changes: Partial<typeof terminal>) =>
    update((settings) => ({
      ...settings,
      appearance: { ...settings.appearance, terminal: { ...settings.appearance.terminal, ...changes } },
    }));

  return (
    <SplitPage preview={<TerminalView session={PREVIEW} />} title="Terminal">
      <Row
        id="theme"
        label={TERMINAL_TERMS.theme.label}
        description="The terminal's colors."
        help="A theme without a light or dark variant uses the default theme's variant."
      >
        <ThemeSelect label={TERMINAL_TERMS.theme.label} onChange={(theme) => set({ theme })} theme={terminal.theme} />
      </Row>

      <Separator />

      <FontRows
        defaults={DEFAULT_MONO_FONTS}
        description="The terminal's font."
        font={terminal.font}
        onChange={(font) => set({ font })}
        stack={monoFontStack}
        terms={TERMINAL_TERMS}
      >
        <Row
          id="lineHeight"
          label={TERMINAL_TERMS.lineHeight.label}
          description="A multiple of the font's height, between 1 and 2.5."
        >
          <LineHeightInput
            label={TERMINAL_TERMS.lineHeight.label}
            onChange={(lineHeight) => set({ font: { ...terminal.font, lineHeight } })}
            value={terminal.font.lineHeight}
          />
        </Row>
      </FontRows>

      <Separator />

      <Row id="cursorStyle" label={TERMINAL_TERMS.cursorStyle.label} description="The terminal's cursor shape.">
        <Select
          items={CURSOR_STYLES}
          onValueChange={(cursorStyle) => {
            if (cursorStyle) {
              set({ cursorStyle });
            }
          }}
          value={terminal.cursorStyle}
        >
          <SelectTrigger aria-label={TERMINAL_TERMS.cursorStyle.label} autoWidth size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CURSOR_STYLES).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row
        id="cursorBlink"
        label={TERMINAL_TERMS.cursorBlink.label}
        description="Whether the cursor blinks while the terminal is focused."
      >
        <Switch
          aria-label={TERMINAL_TERMS.cursorBlink.label}
          checked={terminal.cursorBlink}
          onCheckedChange={(cursorBlink) => set({ cursorBlink })}
        />
      </Row>

      <Separator />

      <Row
        id="copyOnSelect"
        label={TERMINAL_TERMS.copyOnSelect.label}
        description="Copy text to clipboard on selection."
      >
        <Switch
          aria-label={TERMINAL_TERMS.copyOnSelect.label}
          checked={terminal.copyOnSelect}
          onCheckedChange={(copyOnSelect) => set({ copyOnSelect })}
        />
      </Row>

      {TERMINAL_TERMS.macOptionClickForcesSelection && (
        <Row
          id="macOptionClickForcesSelection"
          label={TERMINAL_TERMS.macOptionClickForcesSelection.label}
          description="Hold Option to select text and open the context menu in programs that use the mouse, e.g. tmux."
        >
          <Switch
            aria-label={TERMINAL_TERMS.macOptionClickForcesSelection.label}
            checked={terminal.macOptionClickForcesSelection}
            onCheckedChange={(macOptionClickForcesSelection) => set({ macOptionClickForcesSelection })}
          />
        </Row>
      )}

      {TERMINAL_TERMS.macOptionIsMeta && (
        <Row
          id="macOptionIsMeta"
          label={TERMINAL_TERMS.macOptionIsMeta.label}
          description="Use Option as the Meta key instead of typing special characters."
        >
          <Switch
            aria-label={TERMINAL_TERMS.macOptionIsMeta.label}
            checked={terminal.macOptionIsMeta}
            onCheckedChange={(macOptionIsMeta) => set({ macOptionIsMeta })}
          />
        </Row>
      )}

      <Row
        id="scrollback"
        label={TERMINAL_TERMS.scrollback.label}
        description="The maximum number of lines the terminal keeps in its buffer, between 1,000 and 100,000."
      >
        <ScrollbackInput onChange={(scrollback) => set({ scrollback })} value={terminal.scrollback} />
      </Row>
    </SplitPage>
  );
}

function ScrollbackInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [previous, setPrevious] = useState(value);

  if (previous !== value) {
    setPrevious(value);
    if (parseScrollback(draft) !== value) {
      setDraft(String(value));
    }
  }

  const valid = parseScrollback(draft) !== undefined;

  return (
    <Input
      aria-invalid={!valid}
      aria-label={TERMINAL_TERMS.scrollback.label}
      className="h-7 w-24 rounded-[min(var(--radius-md),12px)] text-sm"
      inputMode="numeric"
      onBlur={() => {
        if (!valid) {
          setDraft(String(value));
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const scrollback = parseScrollback(next);
        if (scrollback !== undefined && scrollback !== value) {
          onChange(scrollback);
        }
      }}
      value={draft}
    />
  );
}

function parseScrollback(text: string): number | undefined {
  const lines = Number(text);
  return /^\d+$/.test(text) && lines >= SCROLLBACK_LIMIT.min && lines <= SCROLLBACK_LIMIT.max ? lines : undefined;
}
