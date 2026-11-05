'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';

import { SWAP, SWAP_TRANSITION } from '../lib/motion';
import { cn } from '../lib/utils';
import { Icon } from './icon';

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-base whitespace-nowrap transition-[color,background-color,border-color,translate] outline-none select-none cursor-default focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive dark:aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline:
          'border-border bg-background hover:overlay-hover aria-expanded:bg-layer-selected aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:aria-expanded:bg-layer-selected',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary-hover aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost: 'hover:overlay-hover aria-expanded:bg-layer-selected aria-expanded:text-foreground',
        destructive: 'bg-error-wash text-error hover:bg-destructive-hover focus-visible:border-destructive/40',
        link: 'cursor-pointer text-link underline-offset-4 hover:text-link-hover hover:underline',
      },
      size: {
        default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * A button. Given `pending`, it swaps its content for a spinner while pending, and ignores clicks without dimming.
 */
export function Button({
  className,
  variant = 'default',
  size = 'default',
  pending,
  children,
  onClick,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    pending?: boolean;
  }) {
  return (
    <ButtonPrimitive
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
        } else {
          onClick?.(event);
        }
      }}
      {...props}
    >
      {pending === undefined ? (
        children
      ) : (
        <MotionConfig reducedMotion="user" transition={SWAP_TRANSITION}>
          {/* The transparent copy keeps the button's width and name while the spinner shows. */}
          <span className="grid place-items-center gap-[inherit]">
            <span className="col-start-1 row-start-1 flex items-center gap-[inherit] opacity-0">{children}</span>
            <AnimatePresence initial={false}>
              {pending ? (
                <motion.span aria-hidden className="col-start-1 row-start-1 flex" key="pending" {...SWAP}>
                  <Icon className="animate-spin" name="loading" />
                </motion.span>
              ) : (
                <motion.span
                  aria-hidden
                  className="col-start-1 row-start-1 flex items-center gap-[inherit]"
                  key="content"
                  {...SWAP}
                >
                  {children}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </MotionConfig>
      )}
    </ButtonPrimitive>
  );
}
