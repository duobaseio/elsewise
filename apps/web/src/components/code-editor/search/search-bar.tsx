import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  SearchQuery,
  search,
  setSearchQuery,
} from '@codemirror/search';
import { EditorSelection, type Extension, type SelectionRange, type StateEffect } from '@codemirror/state';
import { EditorView, keymap, type Panel, runScopeHandlers } from '@codemirror/view';
import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { Kbd } from '@elsewise/components/components/kbd';
import { Toggle } from '@elsewise/components/components/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { cn } from '@elsewise/components/lib/utils';
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  describe,
  replaceRow,
  toggleReplaceRow,
  useSearchBarQuery,
} from '@/components/code-editor/search/search-bar-query';

const OPEN_REPLACE = 'Mod-Alt-f';
const NEXT = 'Enter';
const PREVIOUS = 'Shift-Enter';
const CLOSE = 'Escape';

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
      search({ top: true, createPanel, scrollToMatch }),
      replaceRow,
      keymap.of([
        {
          key: OPEN_REPLACE,
          scope: 'editor search-panel',
          run: (view) => {
            openSearchPanel(view);
            view.dispatch({ effects: toggleReplaceRow.of(true) });
            return true;
          },
        },
      ]),
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
        effects: [setSearchQuery.of(next), scrollToMatch(selection, view)],
        userEvent: 'select.search',
      });
    } else {
      view.dispatch({ effects: setSearchQuery.of(next) });
    }
  }

  function keydown(event: KeyboardEvent<HTMLElement>) {
    if (runScopeHandlers(view, event.nativeEvent, 'search-panel')) {
      event.preventDefault();
    } else if (event.key === 'Enter' && event.target === field.current) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(view);
    } else if (event.key === 'Enter' && (event.target as HTMLElement).id === replaceId) {
      event.preventDefault();
      replaceNext(view);
    }
  }

  return (
    <search
      className="grid grid-cols-[auto_minmax(20rem,auto)_1fr] items-center gap-1 border-border border-b bg-surface px-1.5 py-1 font-sans text-sm text-foreground"
      data-slot="search-bar"
      onKeyDown={keydown}
    >
      {!state.readOnly && (
        <Action
          label="Toggle replace"
          hint={OPEN_REPLACE}
          aria-expanded={replace}
          onClick={() => view.dispatch({ effects: toggleReplaceRow.of(!replace) })}
        >
          <Icon className={cn('transition-transform', !replace && '-rotate-90')} name="expand" />
        </Action>
      )}
      <div className="relative col-start-2 min-w-0">
        <Input
          ref={field}
          main-field="true"
          className="w-full field-sizing-content pr-22 text-sm"
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
          <Option
            label="Match case"
            pressed={query.caseSensitive}
            onChange={(caseSensitive) => update({ caseSensitive })}
          >
            Cc
          </Option>
          <Option label="Whole word" pressed={query.wholeWord} onChange={(wholeWord) => update({ wholeWord })}>
            W
          </Option>
          <Option label="Regex" pressed={query.regexp} onChange={(regexp) => update({ regexp })}>
            .*
          </Option>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span
          className={cn(
            'min-w-20 pl-4 pr-2 text-xs tabular-nums',
            matches.total === 0 && query.valid && query.search !== '' ? 'text-error' : 'text-muted-foreground',
          )}
          role="status"
        >
          {describe(matches, query)}
        </span>
        <Action label="Previous match" hint={PREVIOUS} onClick={() => findPrevious(view)}>
          <Icon name="previous" />
        </Action>
        <Action label="Next match" hint={NEXT} onClick={() => findNext(view)}>
          <Icon name="next" />
        </Action>
        <Action label="Close" hint={CLOSE} className="ml-auto" onClick={() => closeSearchPanel(view)}>
          <Icon name="close" />
        </Action>
      </div>
      {replace && !state.readOnly && (
        <>
          <Input
            id={replaceId}
            className="col-start-2 w-full field-sizing-content text-sm"
            placeholder="Replace"
            aria-label="Replace"
            value={query.replace}
            onChange={(event) => update({ replace: event.target.value })}
          />
          <div className="flex items-center gap-1 pl-2">
            <Button variant="outline" size="xs" disabled={!query.valid} onClick={() => replaceNext(view)}>
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

function scrollToMatch(range: SelectionRange, view: EditorView): StateEffect<unknown> {
  const bounds = view.scrollDOM.getBoundingClientRect();
  const start = view.coordsAtPos(range.from);
  const end = view.coordsAtPos(range.to);
  const visible = start && end && start.top >= bounds.top && end.bottom <= bounds.bottom;
  return EditorView.scrollIntoView(range, { y: visible ? 'nearest' : 'center' });
}

function Option({
  label,
  pressed,
  onChange,
  children,
}: {
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle size="xs" className="font-mono" aria-label={label} pressed={pressed} onPressedChange={onChange} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function Action({
  label,
  hint,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string; hint?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-xs" className={className} aria-label={label} {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {hint && <Kbd binding={hint} />}
      </TooltipContent>
    </Tooltip>
  );
}
