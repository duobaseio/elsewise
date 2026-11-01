'use client';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  anchor,
  container,
  ...props
}: PopoverPrimitive.Popup.Props &
  // `container` redirects the portal from `<body>`. Needed wherever the default
  // target is the wrong one: a themed subtree, or a stacking context the popup
  // has to stay inside.
  Pick<PopoverPrimitive.Portal.Props, 'container'> &
  // `anchor` places the popup against an element other than the trigger, so a
  // popover can open without one.
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'anchor' | 'side' | 'sideOffset'>) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-popover-foreground text-sm shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ease-out-expo motion-reduce:[--tw-enter-scale:1]! motion-reduce:[--tw-enter-translate-x:0]! motion-reduce:[--tw-enter-translate-y:0]! data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export function PopoverHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="popover-header" className={cn('flex flex-col gap-0.5 text-sm', className)} {...props} />;
}

export function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return <PopoverPrimitive.Title data-slot="popover-title" className={cn('font-medium', className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  );
}
