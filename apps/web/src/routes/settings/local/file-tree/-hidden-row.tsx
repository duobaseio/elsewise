import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { Row } from '@elsewise/components/components/settings';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { cn } from '@elsewise/components/lib/utils';
import { DEFAULT_FRONTEND_SETTINGS, type SettingsSearchTerm } from '@elsewise/frontend-plugin';
import { type ComponentProps, type KeyboardEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSettings, useUpdateSettingsSection } from '@/settings/settings';
import { HiddenHelp } from './-help';

/**
 * The row listing the globs the file tree hides. A pattern is edited in place, and an empty one is removed. The field
 * under the patterns adds one.
 */
export function HiddenRow({ term }: { term: SettingsSearchTerm }) {
  const hidden = useSettings((settings) => settings.fileTree.hidden);
  const set = useUpdateSettingsSection('fileTree');

  const field = useRef<HTMLInputElement>(null);
  const focusing = useRef<number>(undefined);
  const [selection, setSelection] = useState<number>();
  const [editing, setEditing] = useState<number>();
  const [duplicate, setDuplicate] = useState<{ index: number; pattern: string }>();

  const edit = (index: number) => {
    if (editing !== undefined && field.current !== null && !commit(editing, field.current.value)) {
      return;
    }
    flushSync(() => setEditing(index));
    field.current?.focus();
    field.current?.select();
  };

  const commit = (index: number, value: string): boolean => {
    const pattern = value.trim();
    const others = hidden.filter((_, other) => other !== index);
    if (pattern !== '' && others.includes(pattern)) {
      setDuplicate({ index, pattern });
      return false;
    }
    setEditing(undefined);

    if (pattern === '') {
      if (index < hidden.length) {
        set({ hidden: others });
      }
    } else if (pattern !== hidden[index]) {
      set({ hidden: index < hidden.length ? hidden.with(index, pattern) : [...hidden, pattern] });
    }
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (selection === undefined || !(event.target instanceof Element) || event.target.role !== 'option') {
      return;
    }
    const moves: Record<string, number> = {
      ArrowDown: Math.min(selection + 1, hidden.length - 1),
      ArrowUp: Math.max(selection - 1, 0),
      Home: 0,
      End: hidden.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      document.getElementById(`hidden-${moves[event.key]}`)?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      edit(selection);
    } else if (PLATFORM === 'mac' ? event.key === 'Backspace' && event.metaKey : event.key === 'Delete') {
      event.preventDefault();
      focusing.current = Math.min(selection, hidden.length - 2);
      remove(selection);
    }
  };

  const remove = (index: number) => set({ hidden: hidden.filter((_, other) => other !== index) });

  const modified =
    hidden.length !== DEFAULT_FRONTEND_SETTINGS.fileTree.hidden.length ||
    hidden.some((pattern, index) => pattern !== DEFAULT_FRONTEND_SETTINGS.fileTree.hidden[index]);

  return (
    <div className="flex flex-col gap-3">
      <Row
        id="hidden"
        label={term.label}
        description="Hide matching files and folders in the file tree."
        help={<HiddenHelp />}
        onReset={modified ? () => set({ hidden: DEFAULT_FRONTEND_SETTINGS.fileTree.hidden }) : undefined}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col rounded-lg border p-1">
          {hidden.length > 0 && (
            <div
              aria-label={term.label}
              className="flex flex-col"
              onKeyDown={onKeyDown}
              onFocus={(event) => {
                if (event.target.role === 'option') {
                  setSelection(Number(event.target.dataset.index));
                }
              }}
              onBlur={(event) => {
                if (
                  !(event.relatedTarget instanceof Element) ||
                  event.relatedTarget.closest('[role="listbox"]') === null
                ) {
                  setSelection(undefined);
                }
              }}
              role="listbox"
            >
              {hidden.map((pattern, index) =>
                editing === index ? (
                  <PatternField
                    key={pattern}
                    duplicate={duplicate?.index === index}
                    aria-label="Pattern"
                    defaultValue={pattern}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const empty = event.currentTarget.value.trim() === '';
                        focusing.current = empty ? Math.min(index, hidden.length - 2) : index;
                        if (!commit(index, event.currentTarget.value)) {
                          focusing.current = undefined;
                        }
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        focusing.current = index;
                        setDuplicate(undefined);
                        setEditing(undefined);
                      }
                    }}
                    onBlur={(event) => {
                      if (event.currentTarget.isConnected) {
                        commit(index, event.currentTarget.value);
                      }
                    }}
                    onChange={() => setDuplicate(undefined)}
                    ref={field}
                  />
                ) : (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: The listbox edits on Enter.
                  <div
                    key={pattern}
                    id={`hidden-${index}`}
                    data-index={index}
                    tabIndex={index === Math.min(selection ?? 0, hidden.length - 1) ? 0 : -1}
                    role="option"
                    aria-label={pattern}
                    aria-selected={selection === index}
                    className="group flex h-6 items-center justify-between gap-4 rounded-sm pl-2 outline-none hover:overlay-hover aria-selected:bg-layer-selected"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => edit(index)}
                    ref={(node) => {
                      if (node !== null && focusing.current === index) {
                        focusing.current = undefined;
                        node.focus();
                      }
                    }}
                  >
                    <span className="truncate text-sm">{pattern}</span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Remove ${pattern}`}
                      className="flex size-6 shrink-0 cursor-default items-center justify-center text-text-3 opacity-0 outline-none group-hover:opacity-100 group-aria-selected:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(index);
                      }}
                    >
                      <Icon name="close" className="size-3" />
                    </button>
                  </div>
                ),
              )}
            </div>
          )}
          <PatternField
            duplicate={duplicate?.index === hidden.length}
            variant="add"
            aria-label="Add pattern"
            placeholder="e.g. *.log or dist/"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (commit(hidden.length, event.currentTarget.value)) {
                  event.currentTarget.value = '';
                }
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.currentTarget.value = '';
                setDuplicate(undefined);
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              if (commit(hidden.length, event.currentTarget.value)) {
                event.currentTarget.value = '';
              }
            }}
            onChange={() => setDuplicate(undefined)}
          />
        </div>
        {duplicate !== undefined && (
          <p className="text-error text-sm" id="hidden-duplicate" role="alert">
            “{duplicate.pattern}” is already hidden.
          </p>
        )}
      </div>
    </div>
  );
}

function PatternField({
  duplicate,
  variant,
  className,
  ...props
}: ComponentProps<typeof Input> & { duplicate: boolean; variant?: 'add' }) {
  return (
    <div className="relative flex flex-col">
      <Input
        className={cn(
          'peer h-6 rounded-sm px-[calc(--spacing(2)-1px)] text-sm',
          variant === 'add' &&
            'not-focus-visible:not-aria-invalid:border-transparent not-focus:placeholder:text-transparent dark:bg-transparent',
          className,
        )}
        aria-describedby={duplicate ? 'hidden-duplicate' : undefined}
        aria-invalid={duplicate || undefined}
        {...props}
      />
      {variant === 'add' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1.5 hidden h-6 items-center gap-[5px] text-sm text-text-2 peer-placeholder-shown:flex peer-focus:hidden"
        >
          <Icon name="add" className="w-3 -translate-y-[0.5px] text-text-3" />
          Add pattern
        </span>
      )}
    </div>
  );
}
