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
 * A search query's matches.
 */
export interface Matches {
  total: number;
  /**
   * The 1-based index of the selected match, or `null` if no match is selected.
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
  const { from, to } = state.selection.main;
  const counted = useMemo((): Matches => {
    const index = found.ranges.findIndex((range) => range.from === from && range.to === to);
    return { total: found.ranges.length, current: index === -1 ? null : index + 1, limited: found.limited };
  }, [found, from, to]);

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
