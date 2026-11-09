import { Icon } from '@elsewise/components/components/icon';
import { cn } from '@elsewise/components/lib/utils';
import type { CSSProperties, ReactNode } from 'react';

/**
 * An illustration filling the tooltip above a note.
 */
export function HelpIllustration({
  note,
  className,
  style,
  children,
}: {
  note: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="flex w-96 flex-col">
      <div aria-hidden className={cn('select-none', className)} inert style={style}>
        {children}
      </div>
      <p className="flex items-center gap-1.5 border-foreground/10 border-t px-3 py-2 text-text-2">
        <Icon className="shrink-0 text-text-3" name="info" />
        {note}
      </p>
    </div>
  );
}
