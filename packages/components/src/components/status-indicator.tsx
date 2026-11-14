'use client';

import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

/**
 * The status.
 */
export type Status = 'idle' | 'running' | 'partial' | 'complete';

const STATUSES = {
  idle: { label: 'Idle', arc: false, dot: false },
  running: { label: 'Running', arc: true, dot: false },
  partial: { label: 'Partly complete', arc: true, dot: true },
  complete: { label: 'Complete', arc: false, dot: true },
} as const satisfies Record<Status, { label: string; arc: boolean; dot: boolean }>;

/**
 * A glyph showing `status`, labeled for assistive technology.
 */
export function StatusIndicator({ status, className, ...props }: { status: Status } & ComponentProps<'span'>) {
  const { label, arc, dot } = STATUSES[status];
  return (
    <span aria-label={label} className={cn('relative inline-block size-4 shrink-0', className)} role="img" {...props}>
      <svg aria-hidden className="block size-full" fill="none" viewBox="0 0 256 256">
        <circle className="text-disabled" cx="128" cy="128" r="96" stroke="currentColor" strokeWidth="16" />
        {dot && <circle className="text-info" cx="128" cy="128" fill="currentColor" r="48" />}
      </svg>
      {arc && (
        // Turns the outer svg, as Chromium only composites the transforms of elements with their own layer.
        <svg
          aria-hidden
          className="absolute inset-0 size-full animate-[spin_2s_linear_infinite] motion-reduce:animate-none"
          fill="none"
          ref={(svg) => {
            for (const animation of svg?.getAnimations() ?? []) {
              animation.startTime = 0;
            }
          }}
          viewBox="0 0 256 256"
        >
          <circle
            className="text-text-2"
            cx="128"
            cy="128"
            pathLength={1}
            r="96"
            stroke="currentColor"
            strokeDasharray="0.25 1"
            strokeLinecap="round"
            strokeWidth="16"
            transform="rotate(-90 128 128)"
          />
        </svg>
      )}
    </span>
  );
}
