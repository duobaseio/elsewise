import { Input } from '@elsewise/components/components/input';
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

/**
 * The field that renames a sidebar row's item from `name`, in place of the row's label.
 *
 * Enter or leaving the field renames it, unless the name is blank or unchanged, and Escape cancels. Enter and Escape
 * move focus back to the row's label.
 */
export function NameInput({
  name,
  label,
  onRename,
  onCancel,
}: {
  name: string;
  label: string;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) {
      return;
    }

    finished.current = true;
    const value = input.current?.value.trim() ?? '';
    if (save && value !== '' && value !== name) {
      onRename(value);
    } else {
      onCancel();
    }
  };

  return (
    <Input
      aria-label={label}
      className="h-6 rounded-md px-1.5 text-[length:inherit]"
      defaultValue={name}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== 'Enter' && event.key !== 'Escape') {
          return;
        }

        event.preventDefault();
        const row = event.currentTarget.closest('[data-sidebar="menu-row"], [data-sidebar="menu-sub-row"]');
        flushSync(() => finish(event.key === 'Enter'));
        row
          ?.querySelector<HTMLElement>('[data-sidebar="menu-row-label"], [data-sidebar="menu-sub-row-label"]')
          ?.focus();
      }}
      ref={input}
    />
  );
}
