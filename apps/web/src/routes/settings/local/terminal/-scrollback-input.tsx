import { Input } from '@elsewise/components/components/input';
import { useState } from 'react';

const SCROLLBACK_LIMIT = { min: 1000, max: 100000 } as const;

export function ScrollbackInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [previous, setPrevious] = useState(value);

  if (previous !== value) {
    setPrevious(value);
    if (parseScrollback(draft) !== value) {
      setDraft(String(value));
    }
  }

  const valid = parseScrollback(draft) !== undefined;

  return (
    <Input
      aria-invalid={!valid}
      aria-label={label}
      className="h-7 w-24 rounded-[min(var(--radius-md),12px)] text-sm"
      inputMode="numeric"
      onBlur={() => {
        if (!valid) {
          setDraft(String(value));
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const scrollback = parseScrollback(next);
        if (scrollback !== undefined && scrollback !== value) {
          onChange(scrollback);
        }
      }}
      value={draft}
    />
  );
}

function parseScrollback(text: string): number | undefined {
  const lines = Number(text);
  return /^\d+$/.test(text) && lines >= SCROLLBACK_LIMIT.min && lines <= SCROLLBACK_LIMIT.max ? lines : undefined;
}
