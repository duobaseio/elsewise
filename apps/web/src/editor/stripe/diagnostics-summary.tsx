import { forEachDiagnostic, setDiagnosticsEffect } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Kbd } from '@elsewise/components/components/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { DEFAULT_COMMANDS } from '@elsewise/plugin';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommandManager } from '@/command/command-manager';
import { useSettings } from '@/settings/settings';

type Counts = Record<(typeof COUNTED)[number], number>;

const COUNTED = ['error', 'warning', 'info'] as const;
const COLORS: Record<keyof Counts, string> = { error: 'text-error', warning: 'text-warning', info: 'text-info' };

interface Mounted {
  view: EditorView;
  dom: HTMLElement;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Returns the extension that shows the diagnostics summary at the editor's top right, and the portal that renders it.
 *
 * The summary counts the diagnostics by severity, with a tick when there are none, and steps through them with the
 * previous and next diagnostic commands. The `stripe` setting turns it off along with the stripe.
 */
export function useDiagnosticsSummary(): { summary: Extension; portal: ReactNode } {
  const shown = useSettings((settings) => settings.appearance.editor.stripe);
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const summary = useMemo(
    () =>
      shown
        ? ViewPlugin.define((view) => {
            const dom = view.dom.appendChild(document.createElement('div'));
            dom.className = 'cm-diagnostics-summary';
            // Keeps focus in the editor, so the commands step from its selection.
            dom.addEventListener('mousedown', (event) => event.preventDefault());
            const listeners = new Set<() => void>();
            const measure = {
              read: () => view.scrollDOM.offsetTop,
              write: (top: number) => {
                dom.style.top = `${top}px`;
              },
            };
            view.requestMeasure(measure);
            setMounted({
              view,
              dom,
              subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
              },
            });

            return {
              update(update) {
                if (update.geometryChanged) {
                  update.view.requestMeasure(measure);
                }
                if (
                  update.docChanged ||
                  update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setDiagnosticsEffect)))
                ) {
                  for (const listener of listeners) {
                    listener();
                  }
                }
              },
              destroy() {
                dom.remove();
                setMounted(null);
              },
            };
          })
        : [],
    [shown],
  );

  const portal =
    mounted && createPortal(<DiagnosticsSummary view={mounted.view} subscribe={mounted.subscribe} />, mounted.dom);
  return { summary, portal: shown ? portal : null };
}

/**
 * The diagnostics summary.
 */
export function DiagnosticsSummary({ view, subscribe }: { view: EditorView; subscribe: Mounted['subscribe'] }) {
  const [counts, setCounts] = useState(() => count(view));
  const commands = useCommandManager();
  // Selected one by one, since a selector has to return the same value for an unchanged keymap.
  const keys = {
    previous: useCommandManager(
      (commands) => commands.keymap.commands.get(DEFAULT_COMMANDS.editor.diagnostics.previous)?.[0],
    ),
    next: useCommandManager((commands) => commands.keymap.commands.get(DEFAULT_COMMANDS.editor.diagnostics.next)?.[0]),
  };

  useEffect(
    () =>
      subscribe(() => {
        const next = count(view);
        setCounts((previous) => (COUNTED.every((severity) => previous[severity] === next[severity]) ? previous : next));
      }),
    [view, subscribe],
  );

  const total = COUNTED.reduce((sum, severity) => sum + counts[severity], 0);
  const summary = COUNTED.filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity}${counts[severity] === 1 ? '' : 's'}`)
    .join(', ');

  return (
    <div className="flex h-6 items-center gap-0.5 font-sans text-sm tabular-nums" data-slot="diagnostics-summary">
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex items-center gap-1.5 px-1.5" role="status" aria-label={summary || 'No diagnostics'} />
          }
        >
          {total === 0 ? (
            <Icon name="check" className="size-3.5 text-success" />
          ) : (
            COUNTED.filter((severity) => counts[severity] > 0).map((severity) => (
              <span key={severity} className={`flex items-center gap-0.5 ${COLORS[severity]}`}>
                <Icon name={severity} className="size-3.5" />
                {counts[severity]}
              </span>
            ))
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">{summary || 'No diagnostics'}</TooltipContent>
      </Tooltip>
      {total > 0 &&
        (
          [
            ['previous', 'Previous diagnostic', DEFAULT_COMMANDS.editor.diagnostics.previous],
            ['next', 'Next diagnostic', DEFAULT_COMMANDS.editor.diagnostics.next],
          ] as const
        ).map(([icon, label, id]) => (
          <Tooltip key={icon}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  aria-label={label}
                  onClick={() => commands.run(id, view)}
                />
              }
            >
              <Icon name={icon} />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {label}
              {keys[icon] && <Kbd binding={keys[icon]} />}
            </TooltipContent>
          </Tooltip>
        ))}
    </div>
  );
}

// Counts `view`'s diagnostics by severity.
function count(view: EditorView): Counts {
  const counts: Counts = { error: 0, warning: 0, info: 0 };
  forEachDiagnostic(view.state, ({ severity }) => {
    if (severity !== 'hint') {
      counts[severity] += 1;
    }
  });
  return counts;
}
