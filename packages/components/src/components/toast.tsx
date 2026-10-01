'use client';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Icon } from './icon';

export const toast = ToastPrimitive.createToastManager();

export function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />;
}

export function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

export function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn('pointer-events-none fixed right-4 bottom-4 z-50 w-full max-w-sm outline-none', className)}
      {...props}
    />
  );
}

export function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        'group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 will-change-transform outline-none select-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        '[--toast-ink:var(--popover-foreground)] [--toast-ink-2:var(--muted-foreground)] [--toast-wash:transparent]',
        'data-[type=success]:[--toast-ink:var(--success)] data-[type=success]:[--toast-ink-2:var(--success)] data-[type=success]:[--toast-wash:var(--success-wash)] data-[type=success]:ring-success-line',
        'data-[type=warning]:[--toast-ink:var(--warning)] data-[type=warning]:[--toast-ink-2:var(--warning)] data-[type=warning]:[--toast-wash:var(--warning-wash)] data-[type=warning]:ring-warning-line',
        'data-[type=error]:[--toast-ink:var(--destructive)] data-[type=error]:[--toast-ink-2:var(--destructive)] data-[type=error]:[--toast-wash:var(--error-wash)] data-[type=error]:ring-error-line',
        'bg-[image:linear-gradient(var(--toast-wash),var(--toast-wash))]',
        '[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.05)))] [--shrink:calc(1-var(--scale))]',
        'h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_400ms,opacity_400ms,height_400ms] data-swiping:transition-none motion-reduce:transition-none',
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
        'data-limited:opacity-0 data-starting-style:opacity-0 data-starting-style:[transform:translateY(100%)]',
        'data-ending-style:opacity-0 [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(100%)]',
        'data-ending-style:data-swipe-direction:duration-200 data-ending-style:data-swipe-direction:ease-out',
        'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+100%))]',
        'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-100%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+100%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-100%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+100%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-100%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+100%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-100%))]',
        className,
      )}
      {...props}
    />
  );
}

export function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        'flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-400 ease-[ease] motion-reduce:transition-none data-behind:opacity-0 data-expanded:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

export function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn('font-heading text-base leading-none font-medium text-(--toast-ink)', className)}
      {...props}
    />
  );
}

export function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-sm text-(--toast-ink-2)', className)}
      {...props}
    />
  );
}

export function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action data-slot="toast-action" render={render} className={cn('shrink-0', className)} {...props} />
  );
}

export function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Close toast"
      render={render}
      className={cn('shrink-0 text-(--toast-ink-2) hover:text-(--toast-ink)', className)}
      {...props}
    >
      {children ?? <Icon name="close" aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

export function ToastIcon({ type }: { type: string | undefined }) {
  let icon: ReactNode = null;

  // Each type carries its semantic voice; only `loading` has none to carry.
  if (type === 'success') {
    icon = <Icon name="success" className="text-success" aria-hidden="true" />;
  }

  if (type === 'info') {
    icon = <Icon name="info" className="text-info" aria-hidden="true" />;
  }

  if (type === 'warning') {
    icon = <Icon name="warning" className="text-warning" aria-hidden="true" />;
  }

  if (type === 'error') {
    icon = <Icon name="error" className="text-destructive" aria-hidden="true" />;
  }

  if (type === 'loading') {
    icon = <Icon name="loading" className="animate-spin" aria-hidden="true" />;
  }

  if (!icon) {
    return null;
  }

  return (
    <span data-slot="toast-icon" className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4">
      {icon}
    </span>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

export function Toaster({ children, toastManager = toast, ...props }: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

export const createToastManager = ToastPrimitive.createToastManager;
export const useToastManager = ToastPrimitive.useToastManager;
