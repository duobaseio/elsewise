import { Icon } from '@elsewise/components/components/icon';
import { letterformClass } from '@elsewise/components/components/letter-icon';
import { cn } from '@elsewise/components/lib/utils';
import type { ActiveTheme } from '@elsewise/plugin';
import type { CSSProperties, ReactNode } from 'react';
import { useActiveTheme } from '@/appearance/themes';
import { SCROLLBAR_WIDTH } from '@/editor/theme';

type Role = keyof ActiveTheme['editor']['tokens'];

type Marker = keyof ActiveTheme['editor']['scrollbarMarkers'];

/**
 * A run of code in a token's colors, marked if set, or the caret.
 */
type Token = readonly [text: string, role?: Role, marker?: Marker] | 'caret';

const COMPLETION: readonly (readonly Token[])[] = [
  [
    ['let', 'declarationKeyword'],
    [' '],
    ['total', 'variable'],
    [': '],
    ['u32', 'type'],
    [' '],
    ['=', 'operator'],
    [' '],
    ['prices', 'variable'],
  ],
  [['    '], ['.', 'punctuation'], ['it', 'method'], 'caret'],
];

const COMPLETIONS = ['iter', 'iter_mut', 'into_iter'] as const;

const USAGES: readonly (readonly Token[])[] = [
  [
    ['let', 'declarationKeyword'],
    [' '],
    ['mut', 'modifier'],
    [' '],
    ['total', 'variable', 'usage'],
    [' '],
    ['=', 'operator'],
    [' '],
    ['0', 'number'],
    [';', 'punctuation'],
  ],
  [
    ['for', 'controlKeyword'],
    [' '],
    ['price', 'variable'],
    [' '],
    ['in', 'controlKeyword'],
    [' '],
    ['&', 'operator'],
    ['prices', 'variable'],
    [' '],
    ['{', 'bracket'],
  ],
  [
    ['    '],
    ['tot', 'variable', 'usage'],
    'caret',
    ['al', 'variable', 'usage'],
    [' '],
    ['+=', 'operator'],
    [' '],
    ['price', 'variable'],
    [';', 'punctuation'],
  ],
  [['}', 'bracket']],
  [
    ['println!', 'macro'],
    ['(', 'bracket'],
    ['"{}"', 'string'],
    [', ', 'punctuation'],
    ['total', 'variable', 'usage'],
    [')', 'bracket'],
    [';', 'punctuation'],
  ],
];

// Searching for `price`, with the caret on `sum`.
const MARKED: readonly (readonly Token[])[] = [
  [
    ['fn', 'declarationKeyword'],
    [' '],
    ['total', 'function'],
    ['(', 'bracket'],
    ['items', 'parameter'],
    [': '],
    ['&', 'operator'],
    ['[', 'bracket'],
    ['u32', 'type'],
    [']', 'bracket'],
    [')', 'bracket'],
    [' '],
    ['->', 'operator'],
    [' '],
    ['u32', 'type'],
    [' '],
    ['{', 'bracket'],
  ],
  [
    ['    '],
    ['let', 'declarationKeyword'],
    [' '],
    ['count', 'variable'],
    [' '],
    ['=', 'operator'],
    [' '],
    ['items', 'parameter'],
    ['.', 'punctuation'],
    ['size', 'method', 'error'],
    ['()', 'bracket'],
    [';', 'punctuation'],
  ],
  [
    ['    '],
    ['let', 'declarationKeyword'],
    [' '],
    ['mut', 'modifier'],
    [' '],
    ['sum', 'variable', 'usage'],
    [' '],
    ['=', 'operator'],
    [' '],
    ['0', 'number'],
    [';', 'punctuation'],
  ],
  [
    ['    '],
    ['for', 'controlKeyword'],
    [' '],
    ['price', 'variable', 'searchMatch'],
    [' '],
    ['in', 'controlKeyword'],
    [' '],
    ['items', 'parameter'],
    [' '],
    ['{', 'bracket'],
  ],
  [
    ['        '],
    ['sum', 'variable', 'usage'],
    'caret',
    [' '],
    ['+=', 'operator'],
    [' '],
    ['price', 'variable', 'searchMatch'],
    [';', 'punctuation'],
  ],
  [['    '], ['}', 'bracket']],
  [['    '], ['sum', 'variable', 'usage']],
  [['}', 'bracket']],
];

/**
 * How much of the file the illustration shows, as a share of the scrollbar.
 */
const SHOWN = 0.5;

/**
 * The markers of the file's lines below the illustration, at their share of the scrollbar.
 */
const BELOW: readonly (readonly [top: number, marker: Marker])[] = [
  [0.62, 'searchMatch'],
  [0.75, 'warning'],
  [0.88, 'searchMatch'],
];

/**
 * Shows a completion's documentation beside the list.
 */
export function CompletionDocumentationHelp({ children }: { children: ReactNode }) {
  const { editor } = useActiveTheme();
  const method = editor.tokens.method?.color ?? editor.foreground;
  return (
    <Illustration note={children}>
      <div className="pt-2">
        <Code lines={COMPLETION} active={1} />
      </div>
      {/* Below the caret's line, starting at the word being completed. */}
      <div className="flex items-start gap-1 pt-1 pr-3 pb-3" style={{ paddingLeft: 'calc(12px + 5ch)' }}>
        <ul
          className="w-36 shrink-0 rounded-lg p-1 shadow-md ring-1 ring-foreground/10"
          style={{ backgroundColor: editor.tooltipBackground }}
        >
          {COMPLETIONS.map((label, i) => (
            <li
              className="flex h-6 items-center rounded-[calc(var(--radius)*0.8)] px-1.5"
              key={label}
              style={i === 0 ? { backgroundColor: editor.completionSelected } : undefined}
            >
              <span
                className={cn(letterformClass('m'), 'mr-1.5 font-sans')}
                style={{ color: method, borderColor: `color-mix(in srgb, ${method} 45%, transparent)` }}
              >
                m
              </span>
              <span className="text-link font-semibold">{label.slice(0, 2)}</span>
              {label.slice(2)}
            </li>
          ))}
        </ul>
        <div
          className="min-w-0 flex-1 rounded-lg px-3 py-2 font-sans text-xs shadow-md ring-1 ring-foreground/10"
          style={{ backgroundColor: editor.tooltipBackground }}
        >
          <div className="font-mono text-code">
            <Tokens
              tokens={[
                ['fn', 'declarationKeyword'],
                [' '],
                ['iter', 'function'],
                ['(', 'bracket'],
                ['&', 'operator'],
                ['self', 'self'],
                [')', 'bracket'],
              ]}
            />
          </div>
          <p className="mt-1 text-text-2">Returns an iterator over the slice.</p>
        </div>
      </div>
    </Illustration>
  );
}

/**
 * Shows the usages of the symbol under the caret highlighted.
 */
export function HighlightUsagesHelp({ children }: { children: ReactNode }) {
  return (
    <Illustration note={children}>
      <div className="py-2">
        <Code lines={USAGES} active={2} />
      </div>
    </Illustration>
  );
}

/**
 * Shows a file's diagnostics, search matches and usages marked on its scrollbar.
 */
export function ScrollbarMarkersHelp({ children }: { children: ReactNode }) {
  const { editor } = useActiveTheme();
  // A line's tick is its last marker's, as the editor draws search matches over usages.
  const shown = MARKED.flatMap((tokens, line) => {
    const marker = tokens.flatMap((token) => (token === 'caret' || token[2] === undefined ? [] : [token[2]])).at(-1);
    return marker === undefined ? [] : [[((line + 0.5) / MARKED.length) * SHOWN, marker] as const];
  });

  return (
    <Illustration note={children}>
      <div className="relative py-2">
        <Code lines={MARKED} active={4} />
        <div className="absolute inset-y-0 right-0" style={{ width: SCROLLBAR_WIDTH }}>
          <span
            className="absolute top-0.5 rounded-full bg-border"
            style={{ left: (SCROLLBAR_WIDTH - 4) / 2, right: (SCROLLBAR_WIDTH - 4) / 2, height: `${SHOWN * 100}%` }}
          />
          {[...shown, ...BELOW].map(([top, marker]) => (
            <span
              className="absolute inset-x-0 h-[3px]"
              key={top}
              style={{ top: `calc(${top * 100}% - 1.5px)`, backgroundColor: editor.scrollbarMarkers[marker] }}
            />
          ))}
        </div>
      </div>
    </Illustration>
  );
}

/**
 * An illustration of the editor, in its theme, filling the tooltip above a note.
 */
function Illustration({ note, children }: { note: ReactNode; children: ReactNode }) {
  const { editor } = useActiveTheme();
  return (
    <div className="flex w-96 flex-col">
      <div
        aria-hidden
        className="font-mono text-code select-none"
        style={{ backgroundColor: editor.background, color: editor.foreground }}
      >
        {children}
      </div>
      <p className="flex items-center gap-1.5 border-foreground/10 border-t px-3 py-2 text-text-2">
        <Icon className="shrink-0 text-text-3" name="info" />
        {note}
      </p>
    </div>
  );
}

function Code({ lines, active }: { lines: readonly (readonly Token[])[]; active: number }) {
  const { editor } = useActiveTheme();
  return lines.map((tokens, i) => (
    <div
      className="px-3 whitespace-pre"
      // biome-ignore lint/suspicious/noArrayIndexKey: the lines are fixed.
      key={i}
      style={i === active ? { backgroundColor: editor.activeLine } : undefined}
    >
      <Tokens tokens={tokens} />
    </div>
  ));
}

function Tokens({ tokens }: { tokens: readonly Token[] }) {
  const { editor } = useActiveTheme();
  // Draws a diagnostic's squiggle like the editor does, in its color.
  const squiggle = (color: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${color}" fill="none" stroke-width=".7"/></svg>`)}") left bottom repeat-x`;
  const marks: Partial<Record<Marker, CSSProperties>> = {
    error: { background: squiggle(editor.error) },
    warning: { background: squiggle(editor.warning) },
    searchMatch: { backgroundColor: editor.searchMatch },
    usage: { backgroundColor: editor.selectionMatch },
  };

  return tokens.map((token, i) => {
    if (token === 'caret') {
      return (
        <span
          className="relative inline-block h-[1.2em] w-0 border-l align-text-bottom"
          // biome-ignore lint/suspicious/noArrayIndexKey: the tokens are fixed.
          key={i}
          style={{ borderColor: editor.caret }}
        />
      );
    }

    const [text, role, marker] = token;
    const style = role === undefined ? undefined : editor.tokens[role];
    return (
      <span
        className={cn(marker !== undefined && 'rounded-[2px]')}
        // biome-ignore lint/suspicious/noArrayIndexKey: the tokens are fixed.
        key={i}
        style={{
          color: style?.color,
          fontWeight: style !== undefined && 'bold' in style && style.bold ? 'bold' : undefined,
          fontStyle: style !== undefined && 'italic' in style && style.italic ? 'italic' : undefined,
          ...(marker === undefined ? undefined : marks[marker]),
        }}
      >
        {text}
      </span>
    );
  });
}
