import { Page } from '@elsewise/components/components/settings';
import { PLATFORM } from '@elsewise/components/lib/platform';
import type { CommandGroup } from '@elsewise/frontend-plugin';
import { createFileRoute } from '@tanstack/react-router';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCommandManager } from '@/command/command-manager';
import { normalizeKey } from '@/command/keymap/keys';
import type { Conflict } from './-command-row';
import { type CommandFilter, CommandSearch } from './-command-search';
import { CommandSections, type Section } from './-command-sections';
import { KeymapRow } from './-keymap-row';

export { KEYMAP_TERMS } from './-keymap-row';

export const Route = createFileRoute('/settings/local/keymap/')({ component: Keymap });

export function Keymap() {
  const [filter, setFilter] = useState<CommandFilter>({ text: '' });
  const sections = useSections(filter);
  const conflicting = useConflicts();

  const results = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const block = results.current;
    const main = block?.closest('main');
    const empty = 'key' in filter ? filter.key === undefined : filter.text.trim() === '';
    if (!block || !main || empty) {
      return;
    }
    const top = block.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    if (main.scrollTop > top) {
      main.scrollTop = top;
    }
  }, [filter]);

  return (
    <Page title="Keymap">
      <KeymapRow />

      {/* The toolbar and the results are never shorter than the scroll container, so a search that leaves few results
          does not shrink the page under the scroll position, which would jump it back to the header. */}
      <div className="flex min-h-[100cqh] flex-col gap-8 [overflow-anchor:none]" ref={results}>
        <CommandSearch filter={filter} onChange={setFilter} />

        <CommandSections sections={sections} conflicting={conflicting} />
      </div>
    </Page>
  );
}

function useSections(filter: CommandFilter): readonly Section[] {
  const groups = useCommandManager((manager) => manager.groups);
  const commands = useCommandManager((manager) => manager.commands);
  const keys = useCommandManager((manager) => manager.keymap.commands);
  // The search's text, trimmed and lowercased, and its key as CodeMirror normalizes it.
  const text = 'text' in filter ? filter.text.trim().toLowerCase() : '';
  const key =
    'key' in filter && filter.key !== undefined ? (normalizeKey(filter.key, PLATFORM) ?? filter.key) : undefined;

  // A group without commands of its own, such as Editor, only shows in the path of the groups in it.
  const sections = useMemo(() => {
    const members = Map.groupBy(commands.values(), (command) => command.group);
    const sections: Section[] = [];
    const visit = (parent: string | undefined, path: readonly CommandGroup[]) => {
      for (const group of groups.values()) {
        if (group.in !== parent) {
          continue;
        }

        const inside = [...path, group];
        const own = members.get(group.id);
        if (own !== undefined) {
          sections.push({ id: group.id, path: inside, commands: own });
        }
        visit(group.id, inside);
      }
    };
    visit(undefined, []);
    return sections;
  }, [groups, commands]);

  return useMemo(() => {
    if (text === '' && key === undefined) {
      return sections;
    }

    return sections.flatMap((section) => {
      const commands =
        key !== undefined
          ? section.commands.filter((command) =>
              (keys.get(command.id) ?? []).some((bound) => (normalizeKey(bound, PLATFORM) ?? bound) === key),
            )
          : section.path.some((group) => group.label.toLowerCase().includes(text))
            ? section.commands
            : section.commands.filter((command) => command.label.toLowerCase().includes(text));
      return commands.length > 0 ? [{ ...section, commands }] : [];
    });
  }, [sections, keys, text, key]);
}

function useConflicts(): ReadonlyMap<string, readonly Conflict[]> {
  const commands = useCommandManager((manager) => manager.commands);
  const keys = useCommandManager((manager) => manager.keymap.commands);
  const bound = useCommandManager((manager) => manager.keymap.keys);

  // The keys each command conflicts over with other commands in its scope. Keys compare as CodeMirror normalizes them, so
  // `Mod-k` and `Meta-k` are the same key on a Mac.
  return useMemo(() => {
    const conflicting = new Map<string, Conflict[]>();
    for (const command of commands.values()) {
      conflicting.set(
        command.id,
        (keys.get(command.id) ?? []).flatMap((key) => {
          const normalized = normalizeKey(key, PLATFORM) ?? key;
          return (bound[command.scope].get(normalized) ?? []).flatMap((id) => {
            const other = commands.get(id);
            return other === undefined || id === command.id
              ? []
              : [
                  {
                    key,
                    command: {
                      id,
                      label: other.label,
                      keys: (keys.get(id) ?? []).filter((key) => (normalizeKey(key, PLATFORM) ?? key) !== normalized),
                    },
                  },
                ];
          });
        }),
      );
    }
    return conflicting;
  }, [commands, keys, bound]);
}
