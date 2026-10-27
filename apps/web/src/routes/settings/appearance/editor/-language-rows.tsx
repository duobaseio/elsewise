import type { EditorLanguageSettings, LineSeparator } from '@elsewise/bridge';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
} from '@elsewise/components/components/combobox';
import { Input } from '@elsewise/components/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Row } from '@elsewise/components/components/settings';
import type { SettingsSearchTerm } from '@elsewise/plugin';
import { type ReactNode, useState } from 'react';

type Key = keyof EditorLanguageSettings;

const INDENT: Record<'spaces' | 'tabs', string> = { spaces: 'Spaces', tabs: 'Tabs' };

const LINE_ENDINGS: Record<'detect' | 'lf' | 'crlf', string> = { detect: 'Detect', lf: 'LF', crlf: 'CRLF' };
const LINE_SEPARATORS: Record<keyof typeof LINE_ENDINGS, LineSeparator | null> = {
  detect: null,
  lf: '\n',
  crlf: '\r\n',
};

const DESCRIPTIONS: Record<Key, string> = {
  tabSize: 'The display width of a tab character, in columns.',
  indentUnit: 'Whether indentation uses tabs or spaces.',
  lineSeparator: 'The separator for new files.',
  visualGuides: 'Columns marked with a vertical rule.',
};

const GUIDE_LIMIT = 500;

export function LanguageRows({
  values,
  overrides,
  terms,
  onChange,
  onReset,
}: {
  values: EditorLanguageSettings;
  overrides?: Partial<EditorLanguageSettings>;
  terms: Record<Key, SettingsSearchTerm>;
  onChange: (patch: Partial<EditorLanguageSettings>) => void;
  onReset?: (key: Key) => void;
}) {
  const spaces = values.indentUnit !== '\t';

  const row = (key: Key, control: ReactNode) => (
    <Row
      id={key}
      label={terms[key].label}
      description={DESCRIPTIONS[key]}
      inherited={overrides !== undefined && !(key in overrides)}
      onReset={overrides !== undefined && key in overrides ? () => onReset?.(key) : undefined}
    >
      {control}
    </Row>
  );

  return (
    <>
      {row(
        'tabSize',
        <WidthInput label="Tab width" onChange={(tabSize) => onChange({ tabSize })} value={values.tabSize} />,
      )}

      {row(
        'indentUnit',
        <>
          <Select
            items={INDENT}
            onValueChange={(value) => {
              if (value) {
                onChange({ indentUnit: value === 'tabs' ? '\t' : ' '.repeat(values.tabSize) });
              }
            }}
            value={spaces ? 'spaces' : 'tabs'}
          >
            <SelectTrigger aria-label="Indent with" autoWidth size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INDENT).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {spaces && (
            <WidthInput
              label="Indent size"
              onChange={(size) => onChange({ indentUnit: ' '.repeat(size) })}
              value={values.indentUnit.length}
            />
          )}
        </>,
      )}

      {row(
        'lineSeparator',
        <Select
          items={LINE_ENDINGS}
          onValueChange={(value) => {
            if (value) {
              onChange({ lineSeparator: LINE_SEPARATORS[value] });
            }
          }}
          value={
            (Object.keys(LINE_SEPARATORS) as (keyof typeof LINE_SEPARATORS)[]).find(
              (key) => LINE_SEPARATORS[key] === values.lineSeparator,
            ) ?? 'detect'
          }
        >
          <SelectTrigger aria-label="Line endings" autoWidth size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LINE_ENDINGS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      )}

      {row(
        'visualGuides',
        <VisualGuides guides={values.visualGuides} onChange={(visualGuides) => onChange({ visualGuides })} />,
      )}
    </>
  );
}

function WidthInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [committed, setCommitted] = useState(value);
  if (committed !== value) {
    setCommitted(value);
    setDraft(String(value));
  }
  const valid = parseWidth(draft) !== undefined;

  return (
    <Input
      aria-invalid={!valid}
      aria-label={label}
      className="h-7 w-16 rounded-[min(var(--radius-md),12px)] text-sm"
      inputMode="numeric"
      onBlur={() => {
        if (!valid) {
          setDraft(String(value));
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const width = parseWidth(next);
        if (width !== undefined && width !== value) {
          onChange(width);
        }
      }}
      value={draft}
    />
  );
}

function parseWidth(text: string): number | undefined {
  const width = Number(text);
  return /^\d+$/.test(text) && width >= 1 ? width : undefined;
}

function VisualGuides({ guides, onChange }: { guides: number[]; onChange: (guides: number[]) => void }) {
  const [draft, setDraft] = useState('');

  return (
    <div className="flex w-60 flex-col gap-1">
      <Combobox
        inputValue={draft}
        items={guides}
        multiple
        onInputValueChange={setDraft}
        onValueChange={(next) => onChange([...next].sort((a, b) => a - b))}
        value={guides}
      >
        <ComboboxChips size="sm">
          <ComboboxValue>
            {(columns: number[]) =>
              columns.map((column) => (
                <ComboboxChip key={column} removeLabel={`Remove guide at ${column}`}>
                  {column}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            aria-label="Add guide"
            inputMode="numeric"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return;
              }
              event.preventDefault();
              const column = Number(draft);
              if (Number.isInteger(column) && column >= 1 && column <= GUIDE_LIMIT && !guides.includes(column)) {
                onChange([...guides, column].sort((a, b) => a - b));
              }
              setDraft('');
            }}
            placeholder="Add"
          />
        </ComboboxChips>
      </Combobox>
      <p className="text-xs text-text-2">Type a column and press Enter.</p>
    </div>
  );
}
