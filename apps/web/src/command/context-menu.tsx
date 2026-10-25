import { LSPPlugin } from '@codemirror/lsp-client';
import type { EditorView } from '@codemirror/view';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@elsewise/components/components/context-menu';
import { formatKey } from '@elsewise/components/lib/platform';
import type { ContextMenuGroup } from '@elsewise/plugin';
import { Fragment, type ReactNode, type RefObject, useRef, useState } from 'react';
import { type CommandManager, useCommandManager } from '@/command/command-manager';

export interface CommandContextMenuProps {
  /**
   * The menu's groups, one per id.
   */
  menu: readonly ContextMenuGroup[];
  view?: RefObject<EditorView | null>;
  /**
   * Called once the menu has closed, before the clicked item runs, e.g. to give the focus back.
   */
  onClosed?: () => void;
  className?: string;
  children: ReactNode;
}

interface Group {
  readonly id: string;
  readonly entries: readonly Entry[];
}

type Entry =
  | {
      readonly type: 'item';
      readonly id: string;
      readonly order: number;
      readonly label: string;
      readonly key?: string;
      readonly disabled: boolean;
      readonly active?: boolean;
      readonly run: () => void;
    }
  | {
      readonly type: 'submenu';
      readonly id: string;
      readonly order: number;
      readonly label: string;
      readonly groups: readonly Group[];
    };

export function CommandContextMenu({ menu, view, onClosed, className, children }: CommandContextMenuProps) {
  const [groups, setGroups] = useState<readonly Group[]>([]);
  const commands = useCommandManager();
  const clicked = useRef<(() => void) | null>(null);

  // Opens only when there is something to show.
  function onOpenChange(open: boolean, details: { cancel(): void }): void {
    if (!open) {
      return;
    }

    const resolved = resolve(menu, commands, view?.current ?? null, []);
    if (resolved.length === 0) {
      details.cancel();
      return;
    }

    setGroups(resolved);
  }

  // Runs the clicked entry once the menu has closed and `onClosed` has run, e.g. given the editor its focus back. The
  // returning focus would otherwise undo a selection that the entry changes later, e.g. on a language server's answer.
  function onOpenChangeComplete(open: boolean): void {
    const run = clicked.current;
    clicked.current = null;
    if (open || run === null) {
      return;
    }

    onClosed?.();
    run();
  }

  return (
    <ContextMenu onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <ContextMenuTrigger className={className}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <Groups groups={groups} onClick={(run) => (clicked.current = run)} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Returns the shown groups of the submenu at the end of `path`, or of the menu when it is empty, sorted. `path` holds the
// submenu ids from the menu down, so a submenu inside itself is skipped. A command or submenu is placed once per group.
function resolve(
  menu: readonly ContextMenuGroup[],
  commands: CommandManager,
  view: EditorView | null,
  path: readonly string[],
): Group[] {
  const lsp = view === null ? null : LSPPlugin.get(view);
  const groups: Group[] = [];
  const sorted = menu
    .filter((group) => group.in === path.at(-1))
    .sort(
      (a, b) =>
        (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id),
    );
  for (const group of sorted) {
    const entries: Entry[] = [];
    const placed = new Set<string>();
    for (const item of group.items) {
      const key = 'submenu' in item ? `submenu:${item.submenu}` : `item:${item.command}`;
      if (placed.has(key)) {
        continue;
      }

      placed.add(key);

      if ('submenu' in item) {
        if (path.includes(item.submenu)) {
          continue;
        }

        const inner = resolve(menu, commands, view, [...path, item.submenu]);
        if (inner.length > 0) {
          entries.push({
            type: 'submenu',
            id: item.submenu,
            label: item.label,
            order: item.order ?? Number.POSITIVE_INFINITY,
            groups: inner,
          });
        }
        continue;
      }

      const command = commands.commands.get(item.command);
      if (command === undefined) {
        console.warn(`Unknown command ${item.command} in context menu`);
        continue;
      }
      try {
        let shown: boolean | undefined;
        let enabled: boolean | undefined;
        let active: boolean | undefined;
        if (command.scope === 'application') {
          shown = command.shown?.(commands.application);
          enabled = command.enabled?.(commands.application);
          active = command.active?.(commands.application);
        } else if (view !== null) {
          shown = command.shown?.(commands.application, view, lsp);
          enabled = command.enabled?.(commands.application, view, lsp);
          active = command.active?.(commands.application, view, lsp);
        } else {
          continue;
        }

        if (shown === false) {
          continue;
        }

        entries.push({
          type: 'item',
          id: command.id,
          label: item.label ?? command.label,
          key: commands.keymap.commands.get(command.id)?.[0],
          disabled: enabled === false,
          active,
          order: item.order ?? Number.POSITIVE_INFINITY,
          run: () => commands.run(command.id, view ?? undefined),
        });
      } catch (error) {
        console.error(`Command ${command.label} failed`, error);
      }
    }

    if (entries.length > 0) {
      entries.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
      groups.push({ id: group.id, entries });
    }
  }

  return groups;
}

function Groups({ groups, onClick }: { groups: readonly Group[]; onClick: (run: () => void) => void }) {
  return groups.map((group, i) => (
    <Fragment key={group.id}>
      {i > 0 && <ContextMenuSeparator />}
      {group.entries.map((entry) =>
        entry.type === 'item' ? (
          entry.active === undefined ? (
            <ContextMenuItem key={`item:${entry.id}`} disabled={entry.disabled} onClick={() => onClick(entry.run)}>
              {entry.label}
              {entry.key !== undefined && <ContextMenuShortcut>{formatKey(entry.key)}</ContextMenuShortcut>}
            </ContextMenuItem>
          ) : (
            <ContextMenuCheckboxItem
              key={`item:${entry.id}`}
              checked={entry.active}
              closeOnClick
              disabled={entry.disabled}
              onClick={() => onClick(entry.run)}
            >
              {entry.label}
              {entry.key !== undefined && <ContextMenuShortcut>{formatKey(entry.key)}</ContextMenuShortcut>}
            </ContextMenuCheckboxItem>
          )
        ) : (
          <ContextMenuSub key={`submenu:${entry.id}`}>
            <ContextMenuSubTrigger>{entry.label}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <Groups groups={entry.groups} onClick={onClick} />
            </ContextMenuSubContent>
          </ContextMenuSub>
        ),
      )}
    </Fragment>
  ));
}
