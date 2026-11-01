import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { Toggle } from '@elsewise/components/components/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { formatKey, PLATFORM } from '@elsewise/components/lib/platform';
import { useEffect, useRef } from 'react';
import { recordKey } from '@/command/keymap/keys';

/**
 * A search for commands, by text or by key.
 */
export type CommandFilter = { text: string } | { key: string | undefined };

/**
 * A search field for the commands, with a toggle to search by key instead of text.
 */
export function CommandSearch({
  filter,
  onChange,
}: {
  filter: CommandFilter;
  onChange: (filter: CommandFilter) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const byKey = 'key' in filter;

  // Mod-f focuses this page's search field rather than the sidebar.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'f' && (PLATFORM === 'mac' ? event.metaKey : event.ctrlKey)) {
        event.preventDefault();
        field.current?.focus();
        field.current?.select();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    // The toolbar sticks to the top of the scroll container, its padding keeping the rows scrolling under it clear of
    // the field, and its margins as wide as a row's hover wash so none peeks out at the sides.
    <div className="sticky top-0 z-10 -mx-2 -mt-2 flex items-center gap-2 bg-background px-2 py-2">
      <div className="relative flex-1">
        <Icon className="pointer-events-none absolute top-0 left-2 h-7 w-3.5 text-text-3" name="search" />
        <Input
          aria-label="Search commands"
          className="h-7 rounded-[min(var(--radius-md),10px)] pr-7 pl-6.5 text-sm"
          onChange={(event) => onChange({ text: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (!('key' in filter)) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            const plain = !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
            if (event.key === 'Escape' && plain) {
              onChange(filter.key === undefined ? { text: '' } : { key: undefined });
            } else {
              const recorded = recordKey(event.nativeEvent, PLATFORM);
              if (recorded !== null) {
                onChange({ key: recorded });
              }
            }
          }}
          placeholder={byKey ? 'Search by shortcut' : 'Search commands'}
          readOnly={byKey}
          ref={field}
          value={'key' in filter ? (filter.key === undefined ? '' : formatKey(filter.key)) : filter.text}
        />
        {('key' in filter ? filter.key !== undefined : filter.text !== '') && (
          <button
            aria-label="Clear search"
            className="absolute top-0 right-2 flex h-7 w-4 cursor-default items-center justify-center rounded-sm text-text-3 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
            onClick={() => {
              onChange(byKey ? { key: undefined } : { text: '' });
              field.current?.focus();
            }}
            type="button"
          >
            <Icon className="size-3.5" name="close" />
          </button>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label="Search by shortcut"
              className="-mx-1.5 w-7 px-0 text-text-3"
              onPressedChange={(pressed) => {
                onChange(pressed ? { key: undefined } : { text: '' });
                field.current?.focus();
              }}
              pressed={byKey}
              size="sm"
            />
          }
        >
          <Icon className="size-4.5" name="search-by-shortcut" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{byKey ? 'Search by name' : 'Search by shortcut'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
