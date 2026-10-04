import { cn } from '@elsewise/components/lib/utils';
import type { ReactNode } from 'react';

/**
 * The strip across the top of a column. In the desktop the native title bar is hidden, so every header is a drag
 * handle for the window and the leftmost one leaves room for the traffic lights. Controls inside it opt out of the
 * drag region themselves.
 */
export function Header({
  className,
  trafficLights = false,
  children,
}: {
  className?: string;
  trafficLights?: boolean;
  children?: ReactNode;
}) {
  const desktop = Boolean(window.bridge?.window);
  return (
    <header
      className={cn(
        'flex h-9 shrink-0 items-center',
        desktop && '[-webkit-app-region:drag]',
        className,
        desktop && trafficLights && 'pl-20',
      )}
    >
      {children}
    </header>
  );
}
