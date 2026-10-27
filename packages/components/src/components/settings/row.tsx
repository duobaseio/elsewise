'use client';

import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Icon } from '../icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { useHighlight } from './highlight';

export type RowProps = ComponentProps<'div'> & {
  /**
   * The row's id, which a search result scrolls to and highlights.
   */
  id: string;

  /**
   * The row's label.
   */
  label: ReactNode;

  /**
   * A sentence under the label.
   */
  description?: ReactNode;

  /**
   * Longer guidance, behind a help icon after the description. Guidance other than text, such as an image, sets its
   * own width.
   */
  help?: ReactNode;

  /**
   * Whether the value is inherited from elsewhere rather than set here, which dims the control.
   */
  inherited?: boolean;

  /**
   * Resets a value set here, overriding an inherited one. Marks the row and offers a Reset button.
   */
  onReset?: () => void;
};

/**
 * A settings row.
 */
export function Row({ id, label, description, help, inherited, onReset, children, className, ...props }: RowProps) {
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
          <span id={`${id}-label`}>{label}</span>
          {onReset !== undefined && (
            <span aria-label="Overridden" className="size-1.5 rounded-full bg-foreground" role="img" />
          )}
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
                  <TooltipContent className={typeof help === 'string' ? undefined : 'max-w-none py-3'}>
                    {help}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </p>
        )}
      </div>
      <div className={cn('flex items-center gap-2', inherited && 'text-text-2')}>
        {onReset !== undefined && (
          <Button
            aria-labelledby={`${id}-reset ${id}-label`}
            id={`${id}-reset`}
            onClick={onReset}
            size="xs"
            variant="ghost"
          >
            Reset
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
