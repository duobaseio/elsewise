'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { createContext, useContext } from 'react';

import { cn } from '../lib/utils';

const TooltipGroupContext = createContext(false);

export function TooltipProvider({ delay = 300, ...props }: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipGroupContext value>
      <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
    </TooltipGroupContext>
  );
}

export function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  const root = <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
  return useContext(TooltipGroupContext) ? root : <TooltipProvider>{root}</TooltipProvider>;
}

export function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  container,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  // `container` redirects the portal from `<body>`. Needed wherever the default
  // target is the wrong one: a themed subtree, or a stacking context the popup
  // has to stay inside.
  Pick<TooltipPrimitive.Portal.Props, 'container'> &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[transform,opacity] duration-125 ease-out has-data-[slot=kbd]:gap-2 data-ending-style:scale-97 data-ending-style:opacity-0 data-instant:duration-0 data-starting-style:scale-97 data-starting-style:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
