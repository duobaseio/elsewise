'use client';

import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor and children arrive through {...props}, so the rule cannot see the association from here. Call sites supply one or the other.
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-base leading-none select-none group-data-disabled:pointer-events-none group-data-disabled:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
