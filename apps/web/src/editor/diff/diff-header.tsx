import { LSPPlugin } from '@codemirror/lsp-client';
import type { EditorView } from '@codemirror/view';
import { Button } from '@elsewise/components/components/button';
import { Icon, type IconName } from '@elsewise/components/components/icon';
import { Toggle } from '@elsewise/components/components/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { DEFAULT_COMMANDS } from '@elsewise/plugin';
import { type RefObject, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useCommandManager } from '@/command/command-manager';
import type { DiffState } from '@/editor/diff/diff';
import { DiffSourceMenu } from '@/editor/diff/diff-source-menu';

const GROUPS: readonly (readonly (readonly [string, IconName])[])[] = [
  [
    [DEFAULT_COMMANDS.editor.diff.previous, 'previous'],
    [DEFAULT_COMMANDS.editor.diff.next, 'next'],
  ],
  [
    [DEFAULT_COMMANDS.editor.diff.unified, 'unified'],
    [DEFAULT_COMMANDS.editor.diff.split, 'split'],
  ],
  [[DEFAULT_COMMANDS.editor.diff.close, 'close']],
];

interface Control {
  readonly label: string;
  readonly enabled: boolean;
  readonly active?: boolean;
}

export interface DiffHeaderProps {
  readonly view: RefObject<EditorView | null>;
  /**
   * The base's name, e.g. `HEAD`.
   */
  readonly base: string;
  /**
   * The target's name, e.g. `Current`.
   */
  readonly target: string;

  readonly diff: DiffState;
}

export function DiffHeader({ view, base, target, diff }: DiffHeaderProps) {
  const commands = useCommandManager();
  const subscribe = useCallback((listener: () => void) => diff.subscribe(listener), [diff]);
  const layout = useSyncExternalStore(subscribe, () => diff.layout);
  const [controls, setControls] = useState<ReadonlyMap<string, Control>>(new Map());

  useEffect(() => {
    const evaluate = () => {
      const editor = view.current;
      const next = new Map<string, Control>();
      if (editor !== null) {
        const lsp = LSPPlugin.get(editor);
        for (const [id] of GROUPS.flat()) {
          const command = commands.commands.get(id);
          if (command?.scope !== 'editor') {
            continue;
          }

          try {
            if (command.shown?.(commands.application, editor, lsp) !== false) {
              next.set(id, {
                label: command.label,
                enabled: command.enabled?.(commands.application, editor, lsp) !== false,
                active: command.active?.(commands.application, editor, lsp),
              });
            }
          } catch (error) {
            console.error(`Command ${command.label} failed`, error);
          }
        }
      }

      setControls((previous) =>
        previous.size === next.size &&
        [...next].every(([id, control]) => {
          const other = previous.get(id);
          return other?.label === control.label && other.enabled === control.enabled && other.active === control.active;
        })
          ? previous
          : next,
      );
    };

    evaluate();
    const unsubscribe = diff.subscribe(evaluate);
    return () => {
      unsubscribe();
    };
  }, [commands, view, diff]);

  // Runs the command with `id` in the target, which keeps the focus.
  const run = (id: string) => {
    const editor = view.current;
    if (editor !== null) {
      commands.run(id, editor);
      editor.focus();
    }
  };

  const picker = (
    <DiffSourceMenu
      view={view}
      trigger={
        <Button variant="ghost" size="xs" className="text-foreground text-sm" aria-label={`Compared with ${base}`}>
          {base}
          <Icon name="expand" data-icon="inline-end" />
        </Button>
      }
    />
  );
  const buttons = (
    <div className="ml-auto flex items-center gap-1.5">
      {GROUPS.filter((group) => group.some(([id]) => controls.has(id))).map((group) => (
        <div key={group[0][0]} className="flex items-center gap-0.5">
          {group.map(([id, icon]) => {
            const control = controls.get(id);
            return (
              control !== undefined && (
                <Tooltip key={id}>
                  <TooltipTrigger
                    render={
                      control.active === undefined ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={control.label}
                          disabled={!control.enabled}
                          onClick={() => run(id)}
                        />
                      ) : (
                        <Toggle
                          size="xs"
                          aria-label={control.label}
                          pressed={control.active}
                          disabled={!control.enabled}
                          onPressedChange={() => run(id)}
                        />
                      )
                    }
                  >
                    <Icon name={icon} />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{control.label}</TooltipContent>
                </Tooltip>
              )
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex shrink-0 items-stretch border-b bg-surface font-sans text-sm" data-slot="diff-header">
      {layout === 'split' ? (
        <>
          <div className="flex flex-1 basis-0 items-center border-r px-1.5 py-1">{picker}</div>
          <div className="flex flex-1 basis-0 items-center gap-1 px-1.5 py-1">
            <span className="border border-transparent px-2">{target}</span>
            {buttons}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center gap-1 px-1.5 py-1">
          {picker}
          <span className="text-muted-foreground">→</span>
          <span className="px-2">{target}</span>
          {buttons}
        </div>
      )}
    </div>
  );
}
