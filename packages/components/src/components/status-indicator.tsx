import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { Icon, type IconName } from './icon';

/**
 * The status.
 */
export type Status = 'idle' | 'running' | 'waiting' | 'finished';

// Each status differs in both glyph and color, so neither alone has to carry it.
const STATUSES = {
  idle: { icon: 'idle', label: 'Idle', className: 'text-text-3' },
  running: { icon: 'running', label: 'Running', className: 'text-info' },
  waiting: { icon: 'waiting', label: 'Waiting for input', className: 'text-warning' },
  finished: { icon: 'finished', label: 'Finished', className: 'text-success' },
} as const satisfies Record<Status, { icon: IconName; label: string; className: string }>;

/**
 * A still glyph showing `status`, labeled for assistive technology.
 */
export function StatusIndicator({
  status,
  className,
  ...props
}: { status: Status } & Omit<ComponentProps<'svg'>, 'name'>) {
  const { icon, label, className: color } = STATUSES[status];
  return (
    <Icon aria-label={label} className={cn('size-4 shrink-0', color, className)} name={icon} role="img" {...props} />
  );
}
