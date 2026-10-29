import {
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  SearchQuery,
  search,
  setSearchQuery,
} from '@codemirror/search';
import { EditorSelection, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, type Panel, runScopeHandlers } from '@codemirror/view';
import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { cn } from '@elsewise/components/lib/utils';
import { DEFAULT_COMMANDS } from '@elsewise/plugin';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommandManager } from '@/command/command-manager';
import { eventKeys } from '@/command/keys';
import { SearchAction, SearchOption } from '@/components/search-controls';
import { scroll } from '@/editor/scroll';
import { scrollbarMarkerSources } from '@/editor/scrollbar-markers/scrollbar-markers';
import {
  currentMatch,
  describe,
  matches,
  replaceRow,
  toggleReplaceRow,
  useSearchBarQuery,
} from '@/editor/search/search-bar-query';

const NEXT = 'Enter';
const PREVIOUS = 'Shift-Enter';
const CLOSE = 'Escape';

const SELECTED = Decoration.mark({ class: 'cm-searchMatch-selected' });

// The commands whose keys also fire in the search bar.
const PANEL: readonly string[] = [
  DEFAULT_COMMANDS.editor.search.find,
  DEFAULT_COMMANDS.editor.search.replace,
  DEFAULT_COMMANDS.editor.search.findNext,
  DEFAULT_COMMANDS.editor.search.findPrevious,
];

interface Mounted {
  view: EditorView;
  dom: HTMLElement;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Returns the search extension with the stock panel swapped for {@link SearchBar}, and the portal that renders it.
 */
export function useSearchExtension(): { search: Extension; portal: ReactNode } {
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const extension = useMemo(() => {
    function createPanel(view: EditorView): Panel {
      const dom = document.createElement('div');
      const listeners = new Set<() => void>();
      return {
        dom,
        top: true,
        mount: () =>
          setMounted({
            view,
            dom,
            subscribe: (listener) => {
              listeners.add(listener);
              return () => listeners.delete(listener);
            },
          }),
        update: () => {
          for (const listener of listeners) {
            listener();
          }
        },
        destroy: () => setMounted(null),
      };
    }

    return [
      search({ top: true, createPanel, scrollToMatch: scroll }),
      matches,
      currentMatch,
      EditorView.outerDecorations.compute([currentMatch], (state) => {
        const match = state.field(currentMatch);
        return match && match.from < match.to ? Decoration.set(SELECTED.range(match.from, match.to)) : Decoration.none;
      }),
      scrollbarMarkerSources.of({
        update: (update) => update.state.field(matches) !== update.startState.field(matches),
        markers: (view) => view.state.field(matches).ranges.map(({ from, to }) => ({ from, to, kind: 'searchMatch' })),
      }),
      replaceRow,
      keymap.of([{ key: CLOSE, scope: 'editor search-panel', run: closeSearchPanel }]),
    ];
  }, []);

  const portal = mounted && createPortal(<SearchBar view={mounted.view} subscribe={mounted.subscribe} />, mounted.dom);
  return { search: extension, portal };
}

/**
 * The editor's search bar.
 */
export function SearchBar({ view, subscribe }: { view: EditorView; subscribe: Mounted['subscribe'] }) {
  const { state, replace, query, matches } = useSearchBarQuery({ view, subscribe });
  const field = useRef<HTMLInputElement>(null);
  const typed = useRef<string | null>(null);
  const replaceId = useId();
  const commands = useCommandManager();
  const openReplace = useCommandManager(
    (commands) => commands.keymap.commands.get(DEFAULT_COMMANDS.editor.search.replace)?.[0],
  );

  // `openSearchPanel` focuses the field and selects its text, but that does not work with a React-rendered bar:
  // * On the first open, the field has not been rendered yet, so the bar focuses it on mount.
  // * On a re-open, React sets the field's value after the selection and clears it, so the bar selects the text again
  //   whenever the query was changed from outside the field.
  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    if (typed.current !== query.search && document.activeElement === field.current) {
      field.current?.select();
    }
    typed.current = null;
  }, [query.search]);

  function update(spec: Partial<ConstructorParameters<typeof SearchQuery>[0]>) {
    const next = new SearchQuery({
      search: query.search,
      caseSensitive: query.caseSensitive,
      literal: query.literal,
      regexp: query.regexp,
      wholeWord: query.wholeWord,
      replace: query.replace,
      ...spec,
    });

    // Selects the next match at or after the cursor, or else the first match in the document. Editing the replace field
    // keeps the selection.
    let match: { from: number; to: number } | null = null;
    if (next.valid && next.replace === query.replace) {
      const after = next.getCursor(view.state, view.state.selection.main.from).next();
      const first = after.done ? next.getCursor(view.state).next() : after;
      match = first.done ? null : first.value;
    }

    if (match) {
      const selection = EditorSelection.range(match.from, match.to);
      view.dispatch({
        selection,
        effects: [setSearchQuery.of(next), scroll(selection, view)],
        userEvent: 'select.search',
      });
    } else {
      view.dispatch({ effects: setSearchQuery.of(next) });
    }
  }

  // CodeMirror's built-in `replaceNext` uses the current selection instead of current match. We first update the
  // selection so that `replaceNext` starts from the correct position.
  function replaceCurrent() {
    const match = view.state.field(currentMatch);
    const { from, to } = view.state.selection.main;
    if (match && (match.from !== from || match.to !== to)) {
      view.dispatch({ selection: EditorSelection.range(match.from, match.to) });
    }
    replaceNext(view);
  }

  function keydown(event: KeyboardEvent<HTMLElement>) {
    // Runs the search commands bound to the key since the editor's keys only fire in the document.
    const ran = eventKeys(event.nativeEvent, PLATFORM).some((key) =>
      commands.keymap.keys.editor.get(key)?.some((id) => PANEL.includes(id) && commands.run(id, view)),
    );
    if (ran || runScopeHandlers(view, event.nativeEvent, 'search-panel')) {
      event.preventDefault();
    } else if (event.key === 'Enter' && event.target === field.current) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(view);
    } else if (event.key === 'Enter' && (event.target as HTMLElement).id === replaceId) {
      event.preventDefault();
      replaceCurrent();
    }
  }

  return (
    <search
      className="grid grid-cols-[auto_minmax(20rem,auto)_1fr] items-center gap-1 border-border border-b bg-surface px-1.5 py-1 font-sans text-sm text-foreground"
      data-slot="search-bar"
      onKeyDown={keydown}
    >
      {!state.readOnly && (
        <SearchAction
          label="Toggle replace"
          hint={openReplace}
          aria-expanded={replace}
          className="text-muted-foreground hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:text-foreground"
          onClick={() => view.dispatch({ effects: toggleReplaceRow.of(!replace) })}
        >
          <Icon className={cn('transition-transform', !replace && '-rotate-90')} name="expand" />
        </SearchAction>
      )}
      <div className="relative col-start-2 min-w-0">
        <Input
          ref={field}
          main-field="true"
          className="h-7 w-full field-sizing-content pr-22 text-sm"
          placeholder="Find"
          aria-label="Find"
          aria-invalid={!query.valid && query.search !== '' ? true : undefined}
          value={query.search}
          onChange={(event) => {
            typed.current = event.target.value;
            update({ search: event.target.value });
          }}
        />
        <div className="absolute inset-y-0 right-0.5 flex items-center gap-0.5">
          <SearchOption
            label="Match case"
            pressed={query.caseSensitive}
            onChange={(caseSensitive) => update({ caseSensitive })}
          >
            Cc
          </SearchOption>
          <SearchOption label="Whole word" pressed={query.wholeWord} onChange={(wholeWord) => update({ wholeWord })}>
            W
          </SearchOption>
          <SearchOption label="Regex" pressed={query.regexp} onChange={(regexp) => update({ regexp })}>
            .*
          </SearchOption>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <span
          className={cn(
            'min-w-20 pl-4 pr-2 text-xs tabular-nums',
            matches.total === 0 && query.valid && query.search !== '' ? 'text-error' : 'text-muted-foreground',
          )}
          role="status"
        >
          {describe(matches, query)}
        </span>
        <SearchAction
          label="Previous match"
          hint={PREVIOUS}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => findPrevious(view)}
        >
          <Icon name="previous" />
        </SearchAction>
        <SearchAction
          label="Next match"
          hint={NEXT}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => findNext(view)}
        >
          <Icon name="next" />
        </SearchAction>
        <SearchAction
          label="Close"
          hint={CLOSE}
          className="ml-auto text-muted-foreground hover:text-foreground"
          onClick={() => closeSearchPanel(view)}
        >
          <Icon name="close" />
        </SearchAction>
      </div>
      {replace && !state.readOnly && (
        <>
          <Input
            id={replaceId}
            className="col-start-2 h-7 w-full field-sizing-content text-sm"
            placeholder="Replace"
            aria-label="Replace"
            value={query.replace}
            onChange={(event) => update({ replace: event.target.value })}
          />
          <div className="flex items-center gap-1 pl-2">
            <Button variant="outline" size="xs" disabled={!query.valid} onClick={replaceCurrent}>
              Replace
            </Button>
            <Button variant="outline" size="xs" disabled={!query.valid} onClick={() => replaceAll(view)}>
              Replace all
            </Button>
          </div>
        </>
      )}
    </search>
  );
}
