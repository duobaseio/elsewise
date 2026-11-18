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
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from '@elsewise/components/components/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Row } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import { FONT_SIZES, type Font, type FontSize, type SettingsSearchTerm } from '@elsewise/frontend-plugin';
import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { type FontChoice, installedFonts } from '@/settings/fonts';
import { LineHeightInput } from './-line-height-input';

const SIZES: Record<string, string> = Object.fromEntries(FONT_SIZES.map((size) => [String(size), String(size)]));

type FontGroup = { label: string | null; value: string; items: readonly FontChoice[] };

/**
 * The rows of a font: its family and size, then its line height, then its ligatures.
 */
export function FontRows({
  font,
  defaults,
  stack,
  terms,
  description,
  lineHeightDescription,
  onChange,
}: {
  font: Font;
  defaults: readonly FontChoice[];
  stack: (family: string | null) => string;
  terms: { font: SettingsSearchTerm; lineHeight: SettingsSearchTerm; ligatures: SettingsSearchTerm };
  description: ReactNode;
  lineHeightDescription: string;
  onChange: (font: Font) => void;
}) {
  return (
    <>
      <Row id="font" label={terms.font.label} description={description}>
        <FontSelect
          family={font.family}
          defaults={defaults}
          stack={stack}
          label={terms.font.label}
          onChange={(family) => onChange({ ...font, family })}
        />

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

      <Row id="lineHeight" label={terms.lineHeight.label} description={lineHeightDescription}>
        <LineHeightInput
          label={terms.lineHeight.label}
          onChange={(lineHeight) => onChange({ ...font, lineHeight })}
          value={font.lineHeight}
        />
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

export function FontSelect({
  family,
  defaults,
  stack,
  label,
  onChange,
}: {
  family: string | null;
  defaults: readonly FontChoice[];
  stack: (family: string | null) => string;
  label: string;
  onChange: (family: string | null) => void;
}) {
  const [installed, setInstalled] = useState<readonly string[]>([]);
  useEffect(() => {
    installedFonts().then(setInstalled);
  }, []);

  const groups: FontGroup[] = [{ label: null, value: 'bundled', items: defaults }];
  if (installed.length > 0) {
    groups.push({
      label: 'Installed',
      value: 'installed',
      items: installed.map((family) => ({ label: family, value: family })),
    });
  }
  const known = groups.flatMap((group) => group.items).find((item) => item.value === family);
  // A family that is neither bundled nor installed is still listed, so the user sees what is set.
  const missing = !known && installed.length > 0;
  const selected = known ?? { label: family ?? '', value: family };
  if (missing) {
    groups.unshift({ label: 'Not installed', value: 'missing', items: [selected] });
  }

  return (
    <Combobox
      autoHighlight
      isItemEqualToValue={(item, value) => item.value === value.value}
      items={groups}
      onValueChange={(choice) => {
        if (choice) {
          onChange(choice.value);
        }
      }}
      value={selected}
    >
      <ComboboxTrigger aria-label={label} className="w-60" size="sm">
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
          {(group: FontGroup, index: number) => (
            <Fragment key={group.value}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup items={group.items}>
                {group.label !== null && <ComboboxLabel>{group.label}</ComboboxLabel>}
                <ComboboxCollection>
                  {(item: FontChoice) => (
                    <ComboboxItem
                      key={item.value ?? ''}
                      style={{ fontFamily: stack(item.value), fontFeatureSettings: item.features }}
                      value={item}
                    >
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            </Fragment>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
