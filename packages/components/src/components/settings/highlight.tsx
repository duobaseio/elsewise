'use client';

import { createContext, type ReactNode, type RefObject, useContext, useEffect, useRef } from 'react';

const HighlightContext = createContext<string | undefined>(undefined);

/**
 * Provides the id of the highlighted row, if any, to every {@link useHighlight} beneath it.
 */
export function HighlightProvider({ id, children }: { id: string | undefined; children: ReactNode }) {
  return <HighlightContext value={id}>{children}</HighlightContext>;
}

/**
 * Whether the row with `id` is highlighted, as props to spread onto its root.
 *
 * The root scrolls into view when it becomes highlighted. A label inside it washes with
 * `in-data-highlighted:bg-match-wash`.
 */
export function useHighlight<T extends HTMLElement>(
  id: string,
): { ref: RefObject<T | null>; 'data-highlighted': '' | undefined } {
  const highlighted = useContext(HighlightContext) === id;
  const ref = useRef<T>(null);

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ block: 'center' });
    }
  }, [highlighted]);

  return { ref, 'data-highlighted': highlighted ? '' : undefined };
}
