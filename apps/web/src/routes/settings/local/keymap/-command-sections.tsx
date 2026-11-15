import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@elsewise/components/components/accordion';
import { Icon } from '@elsewise/components/components/icon';
import { cn } from '@elsewise/components/lib/utils';
import type { Command, CommandGroup } from '@elsewise/frontend-plugin';
import { type FocusEvent, Fragment, type KeyboardEvent, useState } from 'react';
import { useCommandManager } from '@/command/command-manager';
import { useSelectedKeymap, useUpdateKeymap } from '@/command/keymap/keymap';
import { CommandRow, type Conflict } from './-command-row';

/**
 * A group's commands.
 */
export type Section = {
  id: string;
  path: readonly CommandGroup[];
  commands: readonly Command[];
};

/**
 * The commands, in a collapsible section per group.
 */
export function CommandSections({
  sections,
  conflicting,
}: {
  /**
   * The sections matching the search.
   */
  sections: readonly Section[];

  /**
   * Each command's conflicts.
   */
  conflicting: ReadonlyMap<string, readonly Conflict[]>;
}) {
  const { keymap: selected } = useSelectedKeymap();
  const { update, undo, redo, canUndo, canRedo } = useUpdateKeymap();
  const keys = useCommandManager((manager) => manager.keymap.commands);

  const [collapsed, collapse] = useState<readonly string[]>([]);
  const [selection, setSelection] = useState<string>();

  const visible = sections.flatMap(({ id, commands }) =>
    collapsed.includes(id) ? [] : commands.map((command) => command.id),
  );
  const focusable = selection !== undefined && visible.includes(selection) ? selection : visible[0];

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target.getAttribute('role') === 'option') {
      setSelection(event.target.id);
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (
      !(event.relatedTarget instanceof Element) ||
      event.relatedTarget.closest(
        '[data-slot="command-row"], [data-slot="context-menu-content"], [data-slot="popover-content"]',
      ) === null
    ) {
      setSelection(undefined);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = selection === undefined ? -1 : visible.indexOf(selection);
    const last = visible.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(index + 1, last),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      document.getElementById(visible[moves[event.key]] ?? '')?.focus();
    }
  };

  if (sections.length === 0) {
    return <p className="sticky top-11 -mt-8 pt-8 text-center text-text-2">No commands found</p>;
  }

  return (
    <Accordion
      className="border-t"
      multiple
      // Sections the search hides keep whether they are collapsed.
      onValueChange={(open) =>
        collapse([
          ...collapsed.filter((id) => !sections.some((section) => section.id === id)),
          ...sections.flatMap(({ id }) => (open.includes(id) ? [] : [id])),
        ])
      }
      value={sections.flatMap(({ id }) => (collapsed.includes(id) ? [] : [id]))}
    >
      {sections.map(({ id, path, commands }) => (
        <AccordionItem key={id} value={id}>
          <AccordionTrigger
            render={(props) => (
              <h2 {...props} className={cn(props.className, 'sticky top-11 z-[5] -mx-2 bg-background px-2')} />
            )}
          >
            {path.map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 && <Icon className="size-3" name="submenu" />}
                <span>{group.label}</span>
              </Fragment>
            ))}
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <div
              aria-label={path.map((group) => group.label).join(' ')}
              className="flex flex-col gap-1"
              onBlur={onBlur}
              onFocus={onFocus}
              onKeyDown={onKeyDown}
              role="listbox"
            >
              {commands.map((command) => (
                <CommandRow
                  id={command.id}
                  key={command.id}
                  label={command.label}
                  keys={keys.get(command.id) ?? []}
                  conflicting={conflicting.get(command.id)}
                  modified={Object.hasOwn(selected.keys, command.id)}
                  selected={selection === command.id}
                  onUpdate={update}
                  onUndo={canUndo ? undo : undefined}
                  onRedo={canRedo ? redo : undefined}
                  tabIndex={command.id === focusable ? 0 : -1}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
