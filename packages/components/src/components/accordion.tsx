'use client';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';

import { cn } from '../lib/utils';
import { Icon } from './icon';

export function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn('flex w-full flex-col', className)} {...props} />;
}

export function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('not-last:border-b data-closed:pb-4', className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  render,
  ...props
}: AccordionPrimitive.Trigger.Props & {
  /**
   * The heading element around the trigger, `h3` by default.
   */
  render?: AccordionPrimitive.Header.Props['render'];
}) {
  return (
    <AccordionPrimitive.Header className="flex" render={render}>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger -mx-1 flex flex-1 cursor-default items-center gap-1 rounded-sm px-1 pt-8 pb-4 text-left text-heading-sm text-text-2 outline-none select-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring data-disabled:pointer-events-none data-disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
        <Icon
          name="expand"
          data-slot="accordion-trigger-icon"
          className="pointer-events-none ml-auto size-3.5 shrink-0 -rotate-90 transition-transform duration-125 ease-out-expo motion-reduce:transition-none group-data-panel-open/accordion-trigger:rotate-0"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel data-slot="accordion-content" {...props}>
      <div className={cn('pb-8', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}
