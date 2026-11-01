import { getSearchQuery, type SearchQuery, searchPanelOpen } from '@codemirror/search';
import { type EditorState, StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { useMemo, useSyncExternalStore } from 'react';

/**
 * The maximum number of matches that are counted.
 */
export const LIMIT = 1000;

export const matches = StateField.define<{ ranges: readonly { from: number; to: number }[]; limited: boolean }>({
  create: find,
  update(value, transaction) {
    const { state, startState } = transaction;
    return transaction.docChanged ||
      getSearchQuery(state) !== getSearchQuery(startState) ||
      searchPanelOpen(state) !== searchPanelOpen(startState)
      ? find(state)
      : value;
  },
});

function find(state: EditorState): { ranges: readonly { from: number; to: number }[]; limited: boolean } {
  const query = getSearchQuery(state);
  if (!searchPanelOpen(state) || !query.valid) {
    return { ranges: [], limited: false };
  }

  const ranges: { from: number; to: number }[] = [];
  const cursor = query.getCursor(state);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    if (ranges.length === LIMIT) {
      return { ranges, limited: true };
    }
    ranges.push({ from: next.value.from, to: next.value.to });
  }
  return { ranges, limited: false };
}

/**
 * The current match, which stays as the cursor moves off it.
 */
export const currentMatch = StateField.define<{ from: number; to: number } | null>({
  create: (state) => under(state, null),
  update(value, transaction) {
    const { state, startState, changes } = transaction;
    if (!transaction.docChanged && !transaction.selection && state.field(matches) === startState.field(matches)) {
      return value;
    }

    return under(state, value && { from: changes.mapPos(value.from, 1), to: changes.mapPos(value.to, -1) });
  },
});

// Returns the current match, the first of:
// * The exact match, e.g., typing in search field, or using find previous/next.
// * The match the cursor is in.
// * `previous`, if it still matches.
function under(state: EditorState, previous: { from: number; to: number } | null): { from: number; to: number } | null {
  const { ranges } = state.field(matches);
  const { from, to, head } = state.selection.main;
  return (
    ranges.find((range) => range.from === from && range.to === to) ??
    ranges.find((range) => range.from <= head && head <= range.to) ??
    ranges.find((range) => range.from === previous?.from && range.to === previous.to) ??
    null
  );
}

/**
 * A search query's matches.
 */
export interface Matches {
  total: number;
  /**
   * The 1-based index of the current match, or `null` if there is none.
   */
  current: number | null;
  /**
   * Whether there are more matches than {@link LIMIT}.
   */
  limited: boolean;
}

/**
 * Whether the "replace" row is open.
 *
 * Editor state so that the find and replace commands can set it before the bar has been rendered.
 */
export const replaceRow = StateField.define<boolean>({
  create: () => false,
  update: (open, transaction) => transaction.effects.find((effect) => effect.is(toggleReplaceRow))?.value ?? open,
});

/**
 * Opens or closes the "replace" row.
 */
export const toggleReplaceRow = StateEffect.define<boolean>();

/**
 * Returns the editor's state, search query and matches.
 *
 * Updates whenever `subscribe` calls its listener.
 */
export function useSearchBarQuery({
  view,
  subscribe,
}: {
  view: EditorView;
  subscribe: (listener: () => void) => () => void;
}): { state: EditorState; replace: boolean; query: SearchQuery; matches: Matches } {
  const state = useSyncExternalStore(subscribe, () => view.state);
  const replace = state.field(replaceRow, false) ?? false;
  const query = getSearchQuery(state);
  const found = state.field(matches);
  const current = state.field(currentMatch);
  const counted = useMemo((): Matches => {
    const index = current ? found.ranges.indexOf(current) : -1;
    return { total: found.ranges.length, current: index === -1 ? null : index + 1, limited: found.limited };
  }, [found, current]);

  return { state, replace, query, matches: counted };
}

/**
 * Returns a description of `matches`, e.g. `2/3`, `3 results` or `No results`.
 */
export function describe(matches: Matches, query: SearchQuery): string {
  if (query.search === '' || !query.valid) {
    return '';
  }
  if (matches.total === 0) {
    return 'No results';
  }
  const total = matches.limited ? `${LIMIT}+` : `${matches.total}`;
  return matches.current === null ? `${total} results` : `${matches.current}/${total}`;
}
