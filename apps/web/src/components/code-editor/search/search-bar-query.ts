import { getSearchQuery, type SearchQuery } from '@codemirror/search';
import { type EditorState, StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { useMemo, useSyncExternalStore } from 'react';

/**
 * The maximum number of matches that are counted.
 */
export const LIMIT = 1000;

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
 * Editor state so that `Mod-Alt-f` can open it before the bar has been rendered.
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
  const matches = useMemo((): Matches => {
    if (!query.valid) {
      return { total: 0, current: null, limited: false };
    }

    const cursor = query.getCursor(state);
    const { from, to } = state.selection.main;

    let total = 0;
    let current: number | null = null;
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      if (total === LIMIT) {
        return { total, current, limited: true };
      }

      total += 1;
      if (next.value.from === from && next.value.to === to) {
        current = total;
      }
    }

    return { total, current, limited: false };
  }, [state, query]);

  return { state, replace, query, matches };
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
