'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Icon } from './icon';

export function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        // `--scrim` is a named color per theme, not ink at an alpha: at 45% it
        // is opaque enough that a backdrop blur behind it reads as nothing, so
        // the stock `backdrop-blur-xs` came off with the stock `black/10`.
        'fixed inset-0 isolate z-50 bg-scrim duration-100 ease-linear data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-75',
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  container,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props &
  // `container` redirects the portal from `<body>`. Needed wherever the default
  // target is the wrong one: a themed subtree, or a stacking context the popup
  // has to stay inside.
  Pick<DialogPrimitive.Portal.Props, 'container'> & {
    showCloseButton?: boolean;
  }) {
  return (
    <DialogPortal container={container}>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-base text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 ease-out-expo outline-none motion-reduce:[--tw-enter-scale:1]! data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-75',
          // The close button is out of flow, so nothing stops a long title from
          // running under it. The reservation belongs here rather than on the
          // header, which has no way to know whether the button is showing.
          showCloseButton && '[&_[data-slot=dialog-header]]:pr-8',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
          >
            <Icon name="close" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // The negative margins pull the bar out to the popup's own edges, which
        // is why it needs the matching `rounded-b-xl` to stay inside the corner.
        '-mx-4 -mb-4 flex flex-row justify-end gap-2 rounded-b-xl border-border border-t bg-surface-2 p-4',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>}
    </div>
  );
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      // `text-heading` is 15/20 at weight 500 — the token DESIGN.md assigns to
      // dialog titles, and it carries the weight and line-height itself.
      className={cn('font-heading text-heading', className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        // The description is the dialog's body copy, so it stays at the chrome
        // anchor and lets the ink ramp carry the drop from the title.
        'text-base text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
