import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@elsewise/components/components/context-menu';
import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { Kbd, KbdGroup } from '@elsewise/components/components/kbd';
import { Popover, PopoverContent, PopoverTitle } from '@elsewise/components/components/popover';
import { useHighlight } from '@elsewise/components/components/settings';
import { formatKey, PLATFORM } from '@elsewise/components/lib/platform';
import { cn } from '@elsewise/components/lib/utils';
import type { Keymap } from '@elsewise/plugin';
import { type ComponentProps, useRef, useState } from 'react';
import { normalizeKey, recordKey } from '@/command/keymap/keys';

/**
 * A key the command conflicts over with another command in its scope.
 */
export type Conflict = {
  /**
   * The key, as the command writes it.
   */
  key: string;

  /**
   * The other command, with its keys other than `key`.
   */
  command: { id: string; label: string; keys: readonly string[] };
};

export function CommandRow({
  id,
  label,
  keys,
  conflicting = [],
  modified = false,
  selected = false,
  onUpdate,
  onUndo,
  onRedo,
  className,
  ...props
}: ComponentProps<'div'> & {
  /**
   * The command's id, which a search result scrolls to and highlights.
   */
  id: string;

  /**
   * The command's label.
   */
  label: string;

  /**
   * The command's keys.
   */
  keys: readonly string[];

  /**
   * The keys other commands in the command's scope also bind. Each gets a note under the label.
   */
  conflicting?: readonly Conflict[];

  /**
   * Whether the keymap has an entry for the command. Marks the row with a dot and enables Reset.
   */
  modified?: boolean;

  /**
   * Whether the row is the selected one.
   */
  selected?: boolean;

  /**
   * Applies a change to the selected keymap's keys.
   */
  onUpdate: (update: (entries: Keymap['keys']) => Keymap['keys']) => void;

  /**
   * Undoes the last edit to the keymap. Disables Undo when undefined.
   */
  onUndo?: () => void;

  /**
   * Redoes the last undone edit to the keymap. Disables Redo when undefined.
   */
  onRedo?: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const highlight = useHighlight<HTMLDivElement>(id);

  const [recording, setRecording] = useState<{ open: boolean; key?: string }>({ open: false });

  return (
    <ContextMenu
      onOpenChange={(open) => {
        // A right-click does not focus the row by itself.
        if (open) {
          highlight.ref.current?.focus();
        }
      }}
    >
      <ContextMenuTrigger
        aria-selected={selected}
        className={cn(
          '-mx-2 flex min-h-8 items-start justify-between gap-4 rounded-md px-2 scroll-mt-28 outline-none hover:overlay-hover aria-selected:bg-layer-selected',
          className,
        )}
        data-slot="command-row"
        id={id}
        onDoubleClick={(event) => {
          if (!(event.target instanceof Element) || event.target.closest('button') === null) {
            setRecording({ open: true });
          }
        }}
        onKeyDown={(event) => {
          if (!selected) {
            return;
          }

          if (PLATFORM === 'mac' ? event.key === 'Backspace' && event.metaKey : event.key === 'Delete') {
            event.preventDefault();
            if (keys.length > 0) {
              onUpdate((entries) => ({ ...entries, [id]: keys.slice(0, -1) }));
            }
          } else if (event.key === 'Enter' && !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)) {
            event.preventDefault();
            setRecording({ open: true });
          } else if ((PLATFORM === 'mac' ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'z') {
            const change = event.shiftKey ? onRedo : onUndo;
            if (change !== undefined) {
              event.preventDefault();
              change();
            }
          } else if (event.key === 'Escape' && event.target instanceof HTMLElement) {
            event.target.blur();
          }
        }}
        role="option"
        {...highlight}
        {...props}
      >
        <div className={cn('flex min-w-0 flex-col', conflicting.length > 0 && 'pb-1.5')}>
          <div className="flex h-8 items-center">
            <div className="-mx-1.5 flex items-center gap-2 rounded-sm px-1.5 in-data-highlighted:bg-match-wash">
              <span>{label}</span>
              {modified && <span aria-label="Modified" className="size-1.5 rounded-full bg-foreground" role="img" />}
            </div>
          </div>
          {conflicting.map(({ key, command }) => (
            <div className="flex items-center gap-1.5 text-warning text-xs" key={`${key} ${command.id}`} role="note">
              <Icon className="size-3 shrink-0" name="warning" />
              <span>
                {formatKey(key)} conflicts with {command.label}
              </span>
              <span aria-hidden="true">·</span>
              <button
                className="cursor-pointer text-link underline-offset-2 hover:text-link-hover hover:underline"
                onClick={() => {
                  onUpdate((entries) => ({ ...entries, [command.id]: [...command.keys] }));
                  highlight.ref.current?.focus();
                }}
                tabIndex={-1}
                type="button"
              >
                Remove from {command.label}
              </button>
            </div>
          ))}
        </div>
        <KbdGroup className="min-h-8 flex-wrap justify-end gap-1.5">
          {keys.map((key) => (
            <Kbd
              binding={key}
              className={cn(
                'h-5.5 rounded-sm bg-layer-selected px-1.5 text-text-2 text-xs tabular-nums',
                conflicting.some((note) => note.key === key) && 'bg-warning-wash',
              )}
              key={key}
            />
          ))}
        </KbdGroup>
      </ContextMenuTrigger>

      <ContextMenuContent finalFocus={() => highlight.ref.current ?? true}>
        <ContextMenuItem onClick={() => setRecording({ open: true })}>
          Add shortcut…
          <ContextMenuShortcut>{formatKey('Enter')}</ContextMenuShortcut>
        </ContextMenuItem>
        {keys.map((key, index) => (
          <ContextMenuItem
            key={key}
            onClick={() => onUpdate((entries) => ({ ...entries, [id]: keys.filter((other) => other !== key) }))}
          >
            Remove
            <Kbd binding={key} className="tabular-nums" />
            {index === keys.length - 1 && (
              <ContextMenuShortcut>{formatKey(PLATFORM === 'mac' ? 'Mod-Backspace' : 'Delete')}</ContextMenuShortcut>
            )}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!modified}
          onClick={() =>
            onUpdate((entries) => {
              const { [id]: _, ...rest } = entries;
              return rest;
            })
          }
        >
          Reset
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={onUndo === undefined} onClick={onUndo}>
          Undo
          <ContextMenuShortcut>{formatKey('Mod-z')}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={onRedo === undefined} onClick={onRedo}>
          Redo
          <ContextMenuShortcut>{formatKey('Mod-Shift-z')}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>

      <Popover
        onOpenChange={(open) => {
          if (!open) {
            setRecording({ ...recording, open: false });
          }
        }}
        open={recording.open}
      >
        <PopoverContent
          align="end"
          anchor={highlight.ref}
          className="w-80 gap-2 p-3"
          finalFocus={highlight.ref}
          initialFocus={field}
          side="bottom"
          sideOffset={4}
        >
          <PopoverTitle className="text-xs">Add shortcut to “{label}”</PopoverTitle>
          <Input
            aria-label="Key"
            className="h-7 caret-transparent text-sm"
            onKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const plain = !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);

              if (event.key === 'Escape' && plain) {
                setRecording(recording.key === undefined ? { ...recording, open: false } : { open: true });
              } else if (event.key === 'Enter' && plain) {
                const { key } = recording;
                if (key === undefined) {
                  return;
                }

                const normalized = normalizeKey(key, PLATFORM);
                if (!keys.some((other) => normalizeKey(other, PLATFORM) === normalized)) {
                  onUpdate((entries) => ({ ...entries, [id]: [...keys, key] }));
                }
                setRecording({ ...recording, open: false });
              } else {
                const key = recordKey(event.nativeEvent, PLATFORM);
                if (key !== null) {
                  setRecording({ ...recording, key });
                }
              }
            }}
            placeholder="Press a shortcut"
            readOnly
            ref={field}
            value={recording.key === undefined ? '' : formatKey(recording.key)}
          />
          <p className="text-text-2 text-xs">
            {recording.key !== undefined && (
              <>
                <Kbd binding="Enter" /> add ·{' '}
              </>
            )}
            <Kbd binding="Escape" /> {recording.key === undefined ? 'cancel' : 'clear'}
          </p>
        </PopoverContent>
      </Popover>
    </ContextMenu>
  );
}
