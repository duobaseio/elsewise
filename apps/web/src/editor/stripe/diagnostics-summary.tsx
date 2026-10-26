import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Kbd } from '@elsewise/components/components/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { DEFAULT_COMMANDS, type EditorToolbarProps } from '@elsewise/plugin';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useMemo, useSyncExternalStore } from 'react';
import { useCommandManager } from '@/command/command-manager';
import { diagnostics } from '@/editor/diagnostics';
import { useSettings } from '@/settings/settings';

type Counts = Record<(typeof COUNTED)[number], number>;

const COUNTED = ['error', 'warning', 'info'] as const;
const COLORS: Record<keyof Counts, string> = { error: 'text-error', warning: 'text-warning', info: 'text-info' };
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const PRESENCE = {
  initial: { opacity: 0, scale: 0.9, filter: 'blur(2px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
  exit: { opacity: 0, scale: 0.9, filter: 'blur(2px)' },
} as const;

/**
 * The diagnostics summary.
 *
 * The summary counts the diagnostics by severity, with a tick when there are none, and steps through them with the
 * previous and next diagnostic commands. The `stripe` setting turns it off along with the stripe.
 */
export function DiagnosticsSummary({ view, subscribe }: EditorToolbarProps) {
  const shown = useSettings((settings) => settings.appearance.editor.stripe) && !view.state.readOnly;
  const found = useSyncExternalStore(subscribe, () => view.state.field(diagnostics));
  const counts = useMemo(() => {
    const counts: Counts = { error: 0, warning: 0, info: 0 };
    for (const { severity } of found) {
      if (severity !== 'hint') {
        counts[severity] += 1;
      }
    }
    return counts;
  }, [found]);
  const commands = useCommandManager();
  const keys = {
    previous: useCommandManager(
      (commands) => commands.keymap.commands.get(DEFAULT_COMMANDS.editor.diagnostics.previous)?.[0],
    ),
    next: useCommandManager((commands) => commands.keymap.commands.get(DEFAULT_COMMANDS.editor.diagnostics.next)?.[0]),
  };

  if (!shown) {
    return null;
  }

  const total = COUNTED.reduce((sum, severity) => sum + counts[severity], 0);
  const summary = COUNTED.filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity}${counts[severity] === 1 ? '' : 's'}`)
    .join(', ');

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{
        duration: 0.15,
        ease: EASE_OUT_EXPO,
        opacity: { duration: 0.15, ease: 'linear' },
      }}
    >
      <div className="flex h-6 items-center gap-0.5 font-sans text-sm tabular-nums" data-slot="diagnostics-summary">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className="relative flex items-center px-1.5"
                role="status"
                aria-label={summary || 'No diagnostics'}
              />
            }
          >
            <AnimatePresence initial={false} mode="popLayout" anchorX="right">
              {total === 0 ? (
                <motion.span key="tick" {...PRESENCE} className="flex" data-slot="diagnostics-tick">
                  <Icon name="check" className="size-3 text-success" />
                </motion.span>
              ) : (
                <motion.span
                  key="counts"
                  {...PRESENCE}
                  className="flex items-center gap-1.5"
                  data-slot="diagnostics-counts"
                >
                  {COUNTED.filter((severity) => counts[severity] > 0).map((severity) => (
                    <span key={severity} className={`flex items-center gap-0.5 ${COLORS[severity]}`}>
                      <Icon name={severity} className="size-3" />
                      {counts[severity]}
                    </span>
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          </TooltipTrigger>
          <TooltipContent side="bottom">{summary || 'No diagnostics'}</TooltipContent>
        </Tooltip>
        {(
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
                  // Dims and brightens along with the tick and counts' crossfade.
                  className="size-5 text-muted-foreground transition-[color,background-color,border-color,opacity,translate] duration-150 ease-linear hover:text-foreground motion-reduce:transition-none"
                  aria-label={label}
                  // Kept in place without diagnostics, so the counts never shift.
                  disabled={total === 0}
                  onMouseDown={(event) => event.preventDefault()}
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
    </MotionConfig>
  );
}
