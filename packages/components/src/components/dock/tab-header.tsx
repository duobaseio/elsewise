'use client';

import { type ReactNode, useId } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Icon } from '../icon';

/**
 * A panel's tab header.
 */
export function DockTabHeader({
  icon,
  title,
  status,
  onClose,
}: {
  /**
   * The icon before the title.
   */
  icon?: ReactNode;
  title: ReactNode;
  /**
   * The panel's status, e.g. a dot for unsaved changes. It takes the place of the close icon until the tab is hovered.
   */
  status?: ReactNode;
  /**
   * Called by the close button.  The close button is omitted by default.
   */
  onClose?: () => void;
}) {
  const id = useId();
  const marked = status != null && status !== false;

  return (
    <div className="flex h-full items-center gap-1.5 px-2 text-base/6">
      {icon}
      <span id={`${id}-title`}>{title}</span>
      {onClose === undefined ? (
        marked && <span className="-mx-0.5 flex size-4 items-center justify-center text-text-3">{status}</span>
      ) : (
        <Button
          aria-label="Close"
          aria-labelledby={`${id}-close ${id}-title`}
          className={cn(
            '-mx-0.5 size-4 text-text-3 opacity-0 focus-visible:opacity-100 in-[.dv-active-tab]:opacity-100 in-[.dv-tab:hover]:opacity-100',
            marked && 'opacity-100',
          )}
          id={`${id}-close`}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          size="icon-xs"
          variant="ghost"
        >
          {marked && <span className="contents in-[.dv-tab:hover]:hidden">{status}</span>}
          <Icon className={cn('size-3', marked && 'hidden in-[.dv-tab:hover]:block')} name="close" />
        </Button>
      )}
    </div>
  );
}
