import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { cn } from '@elsewise/components/lib/utils';
import type { ISearchOptions, ISearchResultChangeEvent, SearchAddon } from '@xterm/addon-search';
import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';
import { SearchAction, SearchOption } from '@/components/search-controls';

const NEXT = 'Enter';
const PREVIOUS = 'Shift-Enter';
const CLOSE = 'Escape';

export const LIMIT = 1000;

export interface TerminalSearch {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export function TerminalSearchBar({
  search,
  initial,
  decorations,
  field,
  onClose,
}: {
  search: SearchAddon;
  initial: TerminalSearch;
  decorations: NonNullable<ISearchOptions['decorations']>;
  field: RefObject<HTMLInputElement | null>;
  onClose: (query: TerminalSearch) => void;
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
    if (event.key === 'Escape') {
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
