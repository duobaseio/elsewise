import { Button } from '@elsewise/components/components/button';
import { Kbd } from '@elsewise/components/components/kbd';
import { Toggle } from '@elsewise/components/components/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import type { ComponentProps, ReactNode } from 'react';

export function SearchOption({
  label,
  pressed,
  onChange,
  children,
}: {
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle size="xs" className="font-mono" aria-label={label} pressed={pressed} onPressedChange={onChange} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SearchAction({
  label,
  hint,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string; hint?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-xs" className={className} aria-label={label} {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {hint && <Kbd binding={hint} />}
      </TooltipContent>
    </Tooltip>
  );
}
