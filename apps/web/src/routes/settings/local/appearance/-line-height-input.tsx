import { LineHeight } from '@elsewise/bridge';
import { Input } from '@elsewise/components/components/input';
import { useState } from 'react';

export function LineHeightInput({
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
  // Keeps the text as typed, e.g. `1.50`, when the value it saved comes back.
  if (previous !== value) {
    setPrevious(value);
    if (parseLineHeight(draft) !== value) {
      setDraft(String(value));
    }
  }
  const valid = parseLineHeight(draft) !== undefined;

  return (
    <Input
      aria-invalid={!valid}
      aria-label={label}
      className="h-7 w-20 rounded-[min(var(--radius-md),12px)] text-sm"
      inputMode="decimal"
      onBlur={() => {
        if (!valid) {
          setDraft(String(value));
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);

        const lineHeight = parseLineHeight(next);
        if (lineHeight !== undefined && lineHeight !== value) {
          onChange(lineHeight);
        }
      }}
      value={draft}
    />
  );
}

function parseLineHeight(text: string): number | undefined {
  return /^\d+(?:\.\d+)?$/.test(text) ? LineHeight.safeParse(Number(text)).data : undefined;
}
