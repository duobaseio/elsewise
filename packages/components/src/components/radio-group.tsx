'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cn } from '../lib/utils';

export function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn('grid gap-2', className)} {...props} />;
}

export function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-full border border-input transition-colors duration-100 ease-[ease] outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 data-checked:border-primary dark:data-checked:bg-transparent',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2 rounded-full bg-primary transition-[scale,opacity] duration-100 ease-out-expo data-starting-style:scale-50 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-75 motion-reduce:data-starting-style:scale-100!"
      />
    </RadioPrimitive.Root>
  );
}
