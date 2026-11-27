import type { IDockviewPanelProps } from 'dockview-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useFocusRequest } from '@/dock/docks-manager';
import type { PanelComponent } from '@/dock/panel-component';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), ' +
  '[contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const PanelFocusContext = createContext<((focus: ((content: HTMLElement) => void) | null) => void) | null>(null);

export function Panel({ component, ...props }: IDockviewPanelProps & { component: PanelComponent }) {
  const request = useFocusRequest();
  const root = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<((content: HTMLElement) => void) | null>(null);
  const pick = useCallback((picked: ((content: HTMLElement) => void) | null) => setFocus(() => picked), []);
  const monotonic = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    const content = root.current;
    if (content === null || request?.panel !== props.api.id) {
      return;
    }

    const initial = monotonic.current !== request.monotonic;
    if (!initial && !pending.current) {
      return;
    }

    // The panel leaves the focus alone if it has gone outside the dock meanwhile.
    const focused = document.activeElement;
    if (!initial && focused !== null && focused !== document.body && focused.closest('.dv-dockview') === null) {
      return;
    }

    monotonic.current = request.monotonic;

    if (!content.contains(focused)) {
      try {
        focus?.(content);
      } catch (error) {
        console.error(`Focusing panel ${props.api.id} failed`, error);
      }
    }

    if (!content.contains(document.activeElement)) {
      content.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    pending.current = !content.contains(document.activeElement);
  }, [request, focus, props.api.id]);

  return (
    <PanelFocusContext value={pick}>
      <div className="contents" ref={root}>
        <component.panel {...props} />
      </div>
    </PanelFocusContext>
  );
}

/**
 * Picks what takes the focus in the panel that the component is in, with `focus`, which is given the panel's content.
 * Null while there is nothing to focus.
 */
export function usePanelFocus(focus: ((content: HTMLElement) => void) | null) {
  const pick = useContext(PanelFocusContext);
  const latest = useRef(focus);
  useEffect(() => {
    latest.current = focus;
  });

  const ready = focus !== null;
  useEffect(() => {
    if (pick === null || !ready) {
      return undefined;
    }

    pick((content) => latest.current?.(content));
    return () => pick(null);
  }, [pick, ready]);
}
