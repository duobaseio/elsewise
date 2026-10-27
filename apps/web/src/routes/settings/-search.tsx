import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@elsewise/components/components/combobox';
import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { useNavigate } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { linkTo } from '@/settings/default-panels';
import { type SettingsSearchHit, search } from '@/settings/search';
import { useSettingsPanels } from '@/settings/settings-panel-manager';

/**
 * The settings search: a field whose results open the setting they name, highlighted.
 */
export function Search() {
  const navigate = useNavigate();
  const panels = useSettingsPanels((settings) => settings.panels);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query, 150);
  const hits = useMemo(() => search(debounced, panels), [debounced, panels]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'f' && (PLATFORM === 'mac' ? event.metaKey : event.ctrlKey)) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Combobox
      autoHighlight
      filter={null}
      inputValue={query}
      items={hits}
      // The input is ours to clear on selection, so nothing of the picked row may be written back into it.
      itemToStringLabel={() => ''}
      onInputValueChange={(value) => {
        setQuery(value);
        setOpen(value.trim() !== '');
      }}
      onOpenChange={setOpen}
      onValueChange={(hit: SettingsSearchHit | null) => {
        if (hit === null) {
          return;
        }
        setQuery('');
        setOpen(false);
        void navigate({ ...linkTo(hit.panel), replace: true, search: { highlight: hit.id } });
      }}
      open={open && debounced.trim() !== ''}
      value={null}
    >
      <div className="relative px-2 pt-2 pb-2">
        <Icon className="pointer-events-none absolute top-2 left-4 h-7 w-3.5 text-text-3" name="search" />
        <ComboboxPrimitive.Input
          placeholder="Search"
          ref={input}
          render={<Input className="h-7 rounded-[min(var(--radius-md),10px)] bg-background pr-7 pl-6.5 text-sm" />}
        />
        {query !== '' && (
          <button
            aria-label="Clear search"
            className="absolute top-2 right-4 flex h-7 w-4 cursor-default items-center justify-center rounded-sm text-text-3 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            type="button"
          >
            <Icon className="size-3.5" name="close" />
          </button>
        )}
      </div>
      <ComboboxContent align="start">
        <ComboboxEmpty>No settings found</ComboboxEmpty>
        <ComboboxList>
          {(hit: SettingsSearchHit) => (
            <ComboboxItem className="pr-1.5" key={`${hit.panel.id}.${hit.id}`} value={hit}>
              <div className="flex flex-col leading-tight">
                <span>{hit.term.label}</span>
                <span className="flex items-center gap-0.5 text-text-2 text-xs">
                  {panels
                    .filter((panel) => panel.id === hit.panel.in)
                    .map((panel) => (
                      <Fragment key={panel.id}>
                        {panel.label}
                        <Icon className="size-2.5" name="submenu" />
                      </Fragment>
                    ))}
                  {hit.panel.label}
                </span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
