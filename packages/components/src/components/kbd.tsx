import type { ComponentProps } from 'react';
import { formatKey, type Platform } from '../lib/platform';
import { cn } from '../lib/utils';

/**
 * A shortcut, as muted text. Given a `binding` such as `Mod-Alt-f`, shows the chord in this platform's notation —
 * `⌥⌘F` on a Mac, `Ctrl Alt F` elsewhere — and `platform` shows another platform's. Otherwise shows its children.
 */
export function Kbd({
  className,
  binding,
  platform,
  children,
  ...props
}: ComponentProps<'kbd'> & { binding?: string; platform?: Platform }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex w-fit items-center gap-1 font-sans text-text-3 select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    >
      {binding === undefined ? children : formatKey(binding, platform)}
    </kbd>
  );
}

export function KbdGroup({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd-group" className={cn('inline-flex items-center gap-1', className)} {...props} />;
}
