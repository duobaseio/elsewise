import { FONT_SIZES, type Font, type FontSize } from '@elsewise/bridge';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@elsewise/components/components/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Row } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import type { SettingsSearchTerm } from '@elsewise/plugin';
import { type ReactNode, useEffect, useState } from 'react';
import { type FontChoice, installedFonts } from '@/settings/fonts';

const SIZES: Record<string, string> = Object.fromEntries(FONT_SIZES.map((size) => [String(size), String(size)]));

type FontGroup = { value: string; items: readonly FontChoice[] };

/**
 * The rows of a font: its family and size, then its ligatures.
 */
export function FontRows({
  font,
  defaults,
  stack,
  terms,
  description,
  onChange,
}: {
  font: Font;
  defaults: readonly FontChoice[];
  stack: (family: string | null) => string;
  terms: { font: SettingsSearchTerm; ligatures: SettingsSearchTerm };
  description: ReactNode;
  onChange: (font: Font) => void;
}) {
  const [installed, setInstalled] = useState<readonly string[]>([]);
  useEffect(() => {
    installedFonts().then(setInstalled);
  }, []);

  const groups: FontGroup[] = [{ value: 'Bundled', items: defaults }];
  if (installed.length > 0) {
    groups.push({ value: 'Installed', items: installed.map((family) => ({ value: family, label: family })) });
  }
  const known = groups.flatMap((group) => group.items).find((item) => item.value === font.family);
  // A family that is neither bundled nor installed is still listed, so the user sees what is set.
  const missing = !known && installed.length > 0;
  const selected = known ?? { value: font.family, label: font.family ?? '' };
  if (missing) {
    groups.unshift({ value: 'Not installed', items: [selected] });
  }

  return (
    <>
      <Row id="font" label={terms.font.label} description={description}>
        <Combobox
          autoHighlight
          isItemEqualToValue={(item, value) => item.value === value.value}
          items={groups}
          onValueChange={(choice) => {
            if (choice) {
              onChange({ ...font, family: choice.value });
            }
          }}
          value={selected}
        >
          <ComboboxTrigger aria-label={terms.font.label} className="w-60" size="sm">
            <ComboboxValue>
              {(choice: FontChoice | null) => (
                <>
                  {choice?.label}
                  {missing && <span className="text-muted-foreground">(not installed)</span>}
                </>
              )}
            </ComboboxValue>
          </ComboboxTrigger>
          <ComboboxContent align="end">
            <ComboboxInput placeholder="Search fonts" />
            <ComboboxEmpty>No fonts found</ComboboxEmpty>
            <ComboboxList>
              {(group: FontGroup) => (
                <ComboboxGroup items={group.items} key={group.value}>
                  <ComboboxLabel>{group.value}</ComboboxLabel>
                  <ComboboxCollection>
                    {(item: FontChoice) => (
                      <ComboboxItem key={item.value ?? ''} style={{ fontFamily: stack(item.value) }} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <Select
          items={SIZES}
          onValueChange={(value) => {
            if (value) {
              onChange({ ...font, size: Number(value) as FontSize });
            }
          }}
          value={String(font.size)}
        >
          <SelectTrigger aria-label="Font size" autoWidth size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row id="ligatures" label={terms.ligatures.label} description="Use several characters as a single ligature.">
        <Switch
          aria-label={terms.ligatures.label}
          checked={font.ligatures}
          onCheckedChange={(ligatures) => onChange({ ...font, ligatures })}
        />
      </Row>
    </>
  );
}
