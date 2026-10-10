import type { CSSProperties } from 'react';

import type { IconTint } from '../lib/file-icons.gen';
import { cn } from '../lib/utils';

const TINT_CLASS =
  'text-(--icon-tint-light) dark:text-(--icon-tint-dark) border-[color-mix(in_srgb,var(--icon-tint-light)_45%,transparent)] dark:border-[color-mix(in_srgb,var(--icon-tint-dark)_45%,transparent)]';

const LETTER_SIZE: Record<number, string> = {
  0: 'text-[8.5px]/none',
  1: 'text-[8.5px]/none',
  2: 'text-[8.5px]/none',
  3: 'text-[5.75px]/none',
};

/**
 * A letterform tile showing `letters`, tinted by `tint` or untinted when `null`.
 */
export function LetterIcon({
  letters,
  tint,
  className,
}: {
  letters: string;
  tint: IconTint | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="file-icon"
      style={
        tint === null
          ? undefined
          : ({
              '--icon-tint-light': tint.light,
              '--icon-tint-dark': tint.dark,
            } as CSSProperties)
      }
      className={cn(letterformClass(letters), tint === null ? 'border-border text-foreground' : TINT_CLASS, className)}
    >
      {letters}
    </span>
  );
}

/**
 * Returns the classes of an untinted letterform tile showing `letters`, for a tile drawn outside React.
 */
export function letterformClass(letters: string): string {
  return cn(
    'flex size-4 shrink-0 items-center justify-center rounded-[3px] border font-medium tracking-tight',
    LETTER_SIZE[Math.min(letters.length, 3)],
  );
}
