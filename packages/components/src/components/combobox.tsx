'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import type * as React from 'react';
import { createContext, useContext } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';

type Items = ComboboxPrimitive.Root.Props<unknown, boolean>['items'];

const ItemsContext = createContext<Items>(undefined);

export function Combobox<Value, Multiple extends boolean | undefined = false, Item = Value>({
  items,
  ...props
}: ComboboxPrimitive.Root.Props<Value, Multiple, Item>) {
  return (
    <ItemsContext value={items as Items}>
      <ComboboxPrimitive.Root items={items} {...props} />
    </ItemsContext>
  );
}

function labelsOf(items: Items): { key: string; label: React.ReactNode }[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item, index) => {
    if (typeof item === 'string') {
      return [{ key: item, label: item }];
    }
    if (item && typeof item === 'object' && 'items' in item) {
      return labelsOf(item.items).map(({ key, label }) => ({ key: `${index}:${key}`, label }));
    }
    if (item && typeof item === 'object' && 'label' in item) {
      return [{ key: String(item.value), label: item.label as React.ReactNode }];
    }
    return [];
  });
}

export function ComboboxValue({ className, ...props }: ComboboxPrimitive.Value.Props & { className?: string }) {
  return (
    <span data-slot="combobox-value" className={cn('flex flex-1 text-left', className)}>
      <ComboboxPrimitive.Value {...props} />
    </span>
  );
}

export function ComboboxTrigger({
  className,
  size = 'default',
  autoWidth,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props & {
  size?: 'sm' | 'default';
  autoWidth?: boolean;
}) {
  const labels = labelsOf(useContext(ItemsContext));
  const measured = autoWidth && labels.length > 0;

  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-base whitespace-nowrap transition-colors outline-none select-none hover:bg-muted focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] [&_[data-slot=combobox-value]]:line-clamp-1 [&_[data-slot=combobox-value]]:flex [&_[data-slot=combobox-value]]:items-center [&_[data-slot=combobox-value]]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {measured ? (
        // Every option stacked in one grid cell: the cell takes the widest, the value paints over it.
        <span className="grid">
          {labels.map(({ key, label }) => (
            <span aria-hidden className="invisible col-start-1 row-start-1" key={key}>
              {label}
            </span>
          ))}
          <span className="col-start-1 row-start-1 flex">{children}</span>
        </span>
      ) : (
        children
      )}
      <ComboboxPrimitive.Icon render={<CaretDownIcon className="pointer-events-none size-4 text-muted-foreground" />} />
    </ComboboxPrimitive.Trigger>
  );
}

export function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  container,
  ...props
}: ComboboxPrimitive.Popup.Props &
  // `container` redirects the portal from `<body>`. Needed wherever the default
  // target is the wrong one: a themed subtree, or a stacking context the popup
  // has to stay inside.
  Pick<ComboboxPrimitive.Portal.Props, 'container'> &
  Pick<ComboboxPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <ComboboxPrimitive.Portal container={container}>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            'relative isolate z-50 flex max-h-[min(--spacing(72),var(--available-height))] w-(--anchor-width) min-w-36 origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ease-out-expo motion-reduce:[--tw-enter-scale:1]! motion-reduce:[--tw-enter-translate-x:0]! motion-reduce:[--tw-enter-translate-y:0]! data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

export function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 border-b px-2.5" data-slot="combobox-search">
      <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        className={cn(
          'h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'no-scrollbar min-h-0 flex-1 scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain p-1 data-empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

export function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      // Base UI drops the children while the list has matches but keeps the element, hence `empty:hidden`.
      className={cn('px-1.5 py-2 text-center text-sm text-muted-foreground empty:hidden', className)}
      {...props}
    />
  );
}

export function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn('scroll-my-1', className)} {...props} />;
}

export function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn('px-1.5 py-1 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function ComboboxCollection(props: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

export function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-base outline-hidden select-none data-highlighted:bg-layer-hover data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">{children}</span>
      <ComboboxPrimitive.ItemIndicator
        render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

export function ComboboxChips({
  className,
  size = 'default',
  ...props
}: ComboboxPrimitive.Chips.Props & { size?: 'sm' | 'default' }) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      data-size={size}
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors focus-within:border-foreground has-disabled:pointer-events-none has-disabled:opacity-50 has-aria-invalid:border-destructive has-data-[slot=combobox-chip]:px-1 [&_[data-slot=combobox-value]]:contents data-[size=default]:min-h-8 data-[size=sm]:min-h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:text-sm dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

export function ComboboxChip({
  className,
  children,
  showRemove = true,
  removeLabel,
  ...props
}: ComboboxPrimitive.Chip.Props & { showRemove?: boolean; removeLabel?: string }) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'flex h-5 w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0',
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          aria-label={removeLabel}
          className="-ml-1 text-text-2 hover:text-foreground"
          data-slot="combobox-chip-remove"
          render={<Button size="icon-xs" variant="ghost" />}
        >
          <XIcon className="pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

export function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chips-input"
      className={cn(
        'min-w-16 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
