import { type Os, shortcut } from '../lib/os';
import { cn } from '../lib/utils';

/**
 * A keycap. Given a `binding` such as `Mod-Alt-f`, shows the chord in this platform's notation — `⌥⌘F` on a Mac,
 * `Ctrl Alt F` elsewhere — and `os` shows another platform's. Otherwise shows its children.
 */
export function Kbd({
  className,
  binding,
  os,
  children,
  ...props
}: React.ComponentProps<'kbd'> & { binding?: string; os?: Os }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    >
      {binding === undefined ? children : shortcut(binding, os)}
    </kbd>
  );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd-group" className={cn('inline-flex items-center gap-1', className)} {...props} />;
}
