'use client';

import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Icon } from '../icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { useHighlight } from './highlight';

export type RowProps = ComponentProps<'div'> & {
  id: string;
  label: ReactNode;
  /** A sentence under the label. */
  description?: ReactNode;
  /** Longer guidance, behind a help icon after the description. */
  help?: ReactNode;
};

/**
 * A settings row.
 */
export function Row({ id, label, description, help, children, className, ...props }: RowProps) {
  const highlight = useHighlight<HTMLDivElement>(id);
  return (
    <div
      className={cn('flex items-start justify-between gap-8', className)}
      data-slot="row"
      id={id}
      {...highlight}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <div className="-mx-1.5 flex items-center gap-2 self-start rounded-sm px-1.5 in-data-highlighted:bg-match-wash">
          {label}
        </div>
        {(description !== undefined || help !== undefined) && (
          <p className="text-sm text-text-2">
            {description}
            {help !== undefined && (
              <>
                {description !== undefined && ' '}
                <Tooltip>
                  <TooltipTrigger
                    aria-label="Help"
                    className="inline-flex align-middle text-text-3 hover:text-text-2"
                    data-slot="row-help"
                  >
                    <Icon name="help" />
                  </TooltipTrigger>
                  <TooltipContent>{help}</TooltipContent>
                </Tooltip>
              </>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
