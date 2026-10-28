import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { cn } from '@elsewise/components/lib/utils';
import { type ISearchOptions, type ISearchResultChangeEvent, SearchAddon } from '@xterm/addon-search';
import type { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';
import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveTheme } from '@/appearance/themes';
import { SearchAction, SearchOption } from '@/components/search-controls';
import { isShortcut, type TerminalShortcuts } from '@/terminal/shortcuts';

const NEXT = 'Enter';
const PREVIOUS = 'Shift-Enter';
const CLOSE = 'Escape';

export const LIMIT = 1000;

interface Query {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

/**
 * Returns the terminal's search add-on, which adds the find shortcut to `shortcuts`, and the search bar it opens.
 */
export function useTerminalSearch(shortcuts: TerminalShortcuts): { search: ITerminalAddon; bar: ReactNode } {
  const [active, setActive] = useState<{ terminal: Terminal; addon: SearchAddon } | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<Query>({
    query: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const field = useRef<HTMLInputElement>(null);
  // Read by the shortcut, which outlives the render it was created in.
  const opened = useRef(false);
  opened.current = open;

  const colors = useActiveTheme().terminal;
  const decorations = useMemo(() => {
    const { background, searchMatch, searchMatchSelected, searchMatchSelectedBorder } = colors;
    return {
      matchBackground: opaque(searchMatch, background),
      matchOverviewRuler: opaque(searchMatch, background),
      activeMatchBackground: opaque(searchMatchSelected, background),
      activeMatchBorder: searchMatchSelectedBorder,
      activeMatchColorOverviewRuler: opaque(searchMatchSelected, background),
    };
  }, [colors]);

  const search = useMemo<ITerminalAddon>(() => {
    let disposables: IDisposable[] = [];
    return {
      activate(terminal) {
        const addon = new SearchAddon({ highlightLimit: LIMIT + 1 });
        terminal.loadAddon(addon);
        // Opens the search bar, seeded with the selected line, or focuses it when open.
        const find = {
          key: 'f',
          run: () => {
            const selection = terminal.getSelection();
            if (!opened.current && selection !== '' && !selection.includes('\n')) {
              setQuery((query) => ({ ...query, query: selection }));
            }
            setOpen(true);
            field.current?.select();
          },
        };
        disposables = [addon, shortcuts.add([find])];
        setActive({ terminal, addon });
      },
      dispose() {
        for (const disposable of disposables) {
          disposable.dispose();
        }
        disposables = [];
        setActive(null);
      },
    };
  }, [shortcuts]);

  const bar = open && active !== null && (
    <SearchBar
      decorations={decorations}
      field={field}
      initial={query}
      onClose={(query) => {
        setQuery(query);
        setOpen(false);
        active.terminal.focus();
      }}
      search={active.addon}
    />
  );
  return { search, bar };
}

// Returns `color` laid over `background` as `#RRGGBB`, the only form xterm's decorations take.
function opaque(color: string, background: string): string {
  const [r, g, b, alpha] = channels(color);
  const under = channels(background);
  return `#${[r, g, b]
    .map((channel, index) =>
      Math.round(channel * alpha + (under[index] ?? 0) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// Returns the red, green, blue and alpha of a `#RGB[A]`, `#RRGGBB[AA]` or `rgb[a]()` color.
function channels(color: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]+)$/i.exec(color)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const [r = 0, g = 0, b = 0, a = 255] = (full.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16));
    return [r, g, b, a / 255];
  }
  const [r = 0, g = 0, b = 0, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b, a];
}

export function SearchBar({
  search,
  initial,
  decorations,
  field,
  onClose,
}: {
  search: SearchAddon;
  initial: Query;
  decorations: NonNullable<ISearchOptions['decorations']>;
  field: RefObject<HTMLInputElement | null>;
  onClose: (query: Query) => void;
}) {
  const [query, setQuery] = useState(initial.query);
  const [caseSensitive, setCaseSensitive] = useState(initial.caseSensitive);
  const [wholeWord, setWholeWord] = useState(initial.wholeWord);
  const [regex, setRegex] = useState(initial.regex);
  const [results, setResults] = useState({ resultIndex: -1, resultCount: 0 });
  const options: ISearchOptions = { caseSensitive, wholeWord, regex, decorations };
  const valid = !regex || isRegex(query);

  useEffect(() => {
    field.current?.select();
  }, [field]);

  useEffect(() => {
    const listener = search.onDidChangeResults(setResults);
    return () => {
      listener.dispose();
      search.clearDecorations();
    };
  }, [search]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `options` is rebuilt from these on every render.
  useEffect(() => {
    if (query === '' || !valid) {
      search.clearDecorations();
      setResults({ resultIndex: -1, resultCount: 0 });
    } else {
      // SearchAddon records options before comparing with the previous and never rehighlights when only options change.
      // TODO: Remove once fixed upstream.
      search.clearDecorations();
      search.findNext(query, { ...options, incremental: true });
    }
  }, [search, query, caseSensitive, wholeWord, regex, decorations, valid]);

  function keydown(event: KeyboardEvent<HTMLElement>) {
    if (isShortcut(event.nativeEvent, 'f')) {
      event.preventDefault();
      field.current?.select();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose({ query, caseSensitive, wholeWord, regex });
    } else if (event.key === 'Enter' && event.target === field.current && query !== '' && valid) {
      event.preventDefault();
      if (event.shiftKey) {
        search.findPrevious(query, options);
      } else {
        search.findNext(query, options);
      }
    }
  }

  return (
    <search
      className="absolute top-1 right-3 z-10 flex items-center gap-0.5 rounded-lg bg-popover px-1.5 py-1 font-sans text-popover-foreground text-sm shadow-md ring-1 ring-foreground/10"
      data-slot="terminal-search-bar"
      onKeyDown={keydown}
    >
      <div className="relative w-64">
        <Input
          ref={field}
          className="h-7 w-full pr-22 text-sm"
          placeholder="Find"
          aria-label="Find"
          aria-invalid={valid ? undefined : true}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="absolute inset-y-0 right-0.5 flex items-center gap-0.5">
          <SearchOption label="Match case" pressed={caseSensitive} onChange={setCaseSensitive}>
            Cc
          </SearchOption>
          <SearchOption label="Whole word" pressed={wholeWord} onChange={setWholeWord}>
            W
          </SearchOption>
          <SearchOption label="Regex" pressed={regex} onChange={setRegex}>
            .*
          </SearchOption>
        </div>
      </div>
      <span
        className={cn(
          'min-w-20 pr-2 pl-4 text-xs tabular-nums',
          results.resultCount === 0 && query !== '' && valid ? 'text-error' : 'text-muted-foreground',
        )}
        role="status"
      >
        {query !== '' && valid && describe(results)}
      </span>
      <SearchAction
        label="Previous match"
        hint={PREVIOUS}
        className="text-muted-foreground hover:text-foreground"
        disabled={query === '' || !valid}
        onClick={() => search.findPrevious(query, options)}
      >
        <Icon name="previous" />
      </SearchAction>
      <SearchAction
        label="Next match"
        hint={NEXT}
        className="text-muted-foreground hover:text-foreground"
        disabled={query === '' || !valid}
        onClick={() => search.findNext(query, options)}
      >
        <Icon name="next" />
      </SearchAction>
      <SearchAction
        label="Close"
        hint={CLOSE}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => onClose({ query, caseSensitive, wholeWord, regex })}
      >
        <Icon name="close" />
      </SearchAction>
    </search>
  );
}

// Describes `results` as the editor's search bar does, e.g. `2/3`, `3 results` or `No results`.
function describe({ resultIndex, resultCount }: ISearchResultChangeEvent): string {
  if (resultCount === 0) {
    return 'No results';
  }
  const total = resultCount > LIMIT ? `${LIMIT}+` : `${resultCount}`;
  return resultIndex === -1 || resultIndex >= LIMIT ? `${total} results` : `${resultIndex + 1}/${total}`;
}

function isRegex(text: string): boolean {
  try {
    new RegExp(text);
    return true;
  } catch {
    return false;
  }
}
