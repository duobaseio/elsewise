import { DEFAULT_SETTINGS, type KeymapId } from '@elsewise/bridge';
import { Button } from '@elsewise/components/components/button';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from '@elsewise/components/components/combobox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@elsewise/components/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@elsewise/components/components/dropdown-menu';
import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { Row } from '@elsewise/components/components/settings';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import type { Keymap, SettingsSearchTerm } from '@elsewise/frontend-plugin';
import { Fragment, type Ref, type RefObject, useMemo, useRef, useState } from 'react';
import {
  sameKeymap,
  useCopyKeymap,
  useDeleteKeymap,
  useLoadedKeymaps,
  useRenameKeymap,
  useSelectedKeymap,
} from '@/command/keymap/keymap';
import { usePluginStore } from '@/plugins/plugin-store';
import { useUpdateSettings } from '@/settings/settings';

export const KEYMAP_TERMS = {
  keymap: { label: 'Keymap', keywords: ['keys', 'shortcuts', 'keyboard', 'bindings', 'key bindings'] },
} as const satisfies Record<string, SettingsSearchTerm>;

type KeymapGroup = { label: string | null; value: string; items: readonly KeymapItem[] };

type KeymapItem = { key: string; label: string; value: KeymapId };

/**
 * The row selecting the keymap, with its actions. Renaming swaps the select for a field.
 */
export function KeymapRow() {
  const updateSettings = useUpdateSettings();
  const selected = useSelectedKeymap();
  const renameKeymap = useRenameKeymap();
  const user = selected.id.source === 'user' ? selected.id.id : undefined;

  const field = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [width, setWidth] = useState<number>();

  return (
    <Row
      id="keymap"
      label={KEYMAP_TERMS.keymap.label}
      description="Editing a built-in or plugin keymap creates a copy."
    >
      {renaming ? (
        // The field takes the select's width so the row does not shift, and grows past it for a longer name. Its
        // text sits a pixel lower than the select's, so the extra bottom padding lifts it level.
        <Input
          aria-label="Keymap name"
          className="h-7 field-sizing-content pb-1.5"
          defaultValue={selected.keymap.name}
          style={{ minWidth: width }}
          onBlur={(event) => {
            setRenaming(false);
            const name = event.currentTarget.value.trim();
            if (user !== undefined && name !== '' && name !== selected.keymap.name) {
              renameKeymap(user, name);
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              setRenaming(false);
            }
          }}
          ref={field}
        />
      ) : (
        <KeymapSelect
          label={KEYMAP_TERMS.keymap.label}
          keymap={selected.id}
          onChange={(keymap) => updateSettings((settings) => ({ ...settings, keymap }))}
          ref={trigger}
        />
      )}
      <KeymapActions
        field={field}
        keymap={selected.keymap}
        onRename={() => {
          setWidth(trigger.current?.getBoundingClientRect().width);
          setRenaming(true);
        }}
        user={user}
      />
    </Row>
  );
}

export function KeymapSelect({
  label,
  keymap,
  onChange,
  ref,
}: {
  label: string;
  keymap: KeymapId;
  onChange: (keymap: KeymapId) => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const groups = useKeymapGroups();
  const selected = useMemo(() => {
    const items = groups.flatMap((group) => group.items);
    return (
      items.find((item) => sameKeymap(item.value, keymap)) ??
      items.find((item) => sameKeymap(item.value, DEFAULT_SETTINGS.keymap)) ??
      null
    );
  }, [groups, keymap]);

  return (
    <Combobox
      autoHighlight
      isItemEqualToValue={(item: KeymapItem, value: KeymapItem) => sameKeymap(item.value, value.value)}
      items={groups}
      onValueChange={(item: KeymapItem | null) => {
        if (item !== null) {
          onChange(item.value);
        }
      }}
      value={selected}
    >
      <ComboboxTrigger aria-label={label} autoWidth ref={ref} size="sm">
        <ComboboxValue />
      </ComboboxTrigger>
      <ComboboxContent align="end" className="w-auto max-w-(--available-width) min-w-(--anchor-width)">
        <ComboboxInput placeholder="Search keymaps" />
        <ComboboxEmpty>No keymaps found</ComboboxEmpty>
        <ComboboxList>
          {(group: KeymapGroup, index: number) => (
            <Fragment key={group.value}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup items={group.items}>
                {group.label !== null && <ComboboxLabel>{group.label}</ComboboxLabel>}
                <ComboboxCollection>
                  {(item: KeymapItem) => (
                    <ComboboxItem key={item.key} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            </Fragment>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function KeymapActions({
  keymap,
  user,
  field,
  onRename,
}: {
  keymap: Keymap;
  user: string | undefined;
  // The field renaming the keymap, once `onRename` shows it.
  field: RefObject<HTMLInputElement | null>;
  onRename: () => void;
}) {
  const copyKeymap = useCopyKeymap();
  const deleteKeymap = useDeleteKeymap();

  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button aria-label="Keymap actions" className="-mx-1.5 text-text-3" size="icon-sm" variant="ghost" />
                }
              />
            }
          >
            <Icon name="configure" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Keymap actions</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" finalFocus={() => field.current ?? true}>
          <DropdownMenuItem disabled={user === undefined} onClick={onRename}>
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyKeymap(keymap)}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={user === undefined}
            onClick={() => {
              if (user !== undefined) {
                setDeleting({ id: user, name: keymap.name });
                setConfirming(true);
              }
            }}
            variant="destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setConfirming} open={confirming}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete keymap?</DialogTitle>
            <DialogDescription>Permanently deletes “{deleting?.name}”.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <DialogClose
              onClick={() => {
                if (deleting !== null) {
                  deleteKeymap(deleting.id);
                }
              }}
              render={<Button variant="destructive" />}
            >
              Delete
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useKeymapGroups(): readonly KeymapGroup[] {
  const keymaps = useLoadedKeymaps();
  const plugins = usePluginStore((store) => store.plugins);

  return useMemo(() => {
    const groups = new Map<string, { label: string | null; value: string; items: KeymapItem[] }>();
    for (const { id, keymap } of keymaps) {
      const key = id.source === 'plugin' ? `plugin/${id.plugin}` : id.source;
      let group = groups.get(key);
      if (group === undefined) {
        let label: string | null = null;
        if (id.source === 'plugin') {
          const plugin = plugins.find((other) => other.id === id.plugin);
          label = plugin !== undefined && plugin.status !== 'invalid' ? plugin.manifest.name : id.plugin;
        }
        group = { label, value: key, items: [] };
        groups.set(key, group);
      }
      group.items.push({ key: `${key}/${id.id}`, label: keymap.name, value: id });
    }
    return [...groups.values()];
  }, [keymaps, plugins]);
}
