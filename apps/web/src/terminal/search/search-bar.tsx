import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { cn } from '@elsewise/components/lib/utils';
import { DEFAULT_COMMANDS, DEFAULT_KEYS, type TerminalCommand } from '@elsewise/plugin';
import { type ISearchOptions, type ISearchResultChangeEvent, SearchAddon } from '@xterm/addon-search';
import type { Terminal } from '@xterm/xterm';
import { type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveTheme } from '@/appearance/themes';
import { useCommandManager } from '@/command/command-manager';
import { eventKeys } from '@/command/keys';
import { SearchAction, SearchOption } from '@/components/search-controls';

const NEXT = 'Enter';
const PREVIOUS = 'Shift-Enter';
const CLOSE = 'Escape';

export const LIMIT = 1000;

// TODO: Open the search directly once terminals have state that commands can reach.
const FIND = 'elsewise-terminal-find';

export const TERMINAL_FIND: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.search.find,
  label: 'Find…',
  defaultKeys: DEFAULT_KEYS.terminal.search.find,
  run: (_, terminal) =>
    terminal.element !== undefined && !terminal.element.dispatchEvent(new Event(FIND, { cancelable: true })),
};

interface Query {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export function TerminalSearch({ terminal }: { terminal: Terminal | null }) {
  const [search, setSearch] = useState<SearchAddon | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<Query>({
    query: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const field = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (terminal === null) {
      return;
    }

    const addon = new SearchAddon({ highlightLimit: LIMIT + 1 });
    terminal.loadAddon(addon);
    setSearch(addon);
    return () => {
      addon.dispose();
      setSearch(null);
    };
  }, [terminal]);

  // Handles the find command.
  useEffect(() => {
    if (terminal?.element === undefined) {
      return;
    }

    const find = (event: Event) => {
      event.preventDefault();
      const selection = terminal.getSelection();
      if (selection !== '' && !selection.includes('\n')) {
        setQuery((query) => ({ ...query, query: selection }));
      }
      setOpen(true);
      field.current?.select();
    };

    const element = terminal.element;
    element.addEventListener(FIND, find);

    return () => element.removeEventListener(FIND, find);
  }, [terminal]);

  if (!open || terminal === null || search === null) {
    return null;
  }

  return (
    <SearchBar
      decorations={decorations}
      field={field}
      query={query}
      onChange={setQuery}
      onClose={() => {
        setOpen(false);
        terminal.focus();
      }}
      search={search}
    />
  );
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
  query: current,
  onChange,
  decorations,
  field,
  onClose,
}: {
  search: SearchAddon;
  query: Query;
  onChange: (query: Query) => void;
  decorations: NonNullable<ISearchOptions['decorations']>;
  field: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const { query, caseSensitive, wholeWord, regex } = current;
  const [results, setResults] = useState({ resultIndex: -1, resultCount: 0 });
  const keys = useCommandManager((commands) => commands.keymap.keys.terminal);
  const options: ISearchOptions = { caseSensitive, wholeWord, regex, decorations };
  const valid = !regex || isRegex(query);
  const typed = useRef<string | null>(null);

  // Focuses the field when the bar opens, and selects its text whenever the query changes from outside the field.
  useEffect(() => {
    field.current?.focus();
  }, [field]);

  useEffect(() => {
    if (typed.current !== query && document.activeElement === field.current) {
      field.current?.select();
    }
    typed.current = null;
  }, [field, query]);

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
    const find = eventKeys(event.nativeEvent, PLATFORM).some((key) =>
      keys.get(key)?.includes(DEFAULT_COMMANDS.terminal.search.find),
    );

    if (find) {
      event.preventDefault();
      field.current?.select();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
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
          onChange={(event) => {
            typed.current = event.target.value;
            onChange({ ...current, query: event.target.value });
          }}
        />
        <div className="absolute inset-y-0 right-0.5 flex items-center gap-0.5">
          <SearchOption
            label="Match case"
            pressed={caseSensitive}
            onChange={(caseSensitive) => onChange({ ...current, caseSensitive })}
          >
            Cc
          </SearchOption>
          <SearchOption
            label="Whole word"
            pressed={wholeWord}
            onChange={(wholeWord) => onChange({ ...current, wholeWord })}
          >
            W
          </SearchOption>
          <SearchOption label="Regex" pressed={regex} onChange={(regex) => onChange({ ...current, regex })}>
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
        onClick={onClose}
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
