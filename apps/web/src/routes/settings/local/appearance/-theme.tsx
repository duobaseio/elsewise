import type { ThemeId } from '@elsewise/bridge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { sameTheme, THEMES } from '@/appearance/themes';

export const THEME_ITEMS = THEMES.map((theme) => ({ value: theme.id, label: theme.theme.name }));

type ThemeChoice = { value: ThemeId | null; label: string };

const THEME_CHOICES: readonly ThemeChoice[] = [{ value: null, label: 'Same as interface' }, ...THEME_ITEMS];

function sameThemeOrNone(a: ThemeId | null, b: ThemeId | null): boolean {
  return a === null || b === null ? a === b : sameTheme(a, b);
}

export function ThemeSelect({
  theme,
  label,
  onChange,
}: {
  theme: ThemeId | null;
  label: string;
  onChange: (theme: ThemeId | null) => void;
}) {
  return (
    <Select
      isItemEqualToValue={(a: ThemeChoice, b: ThemeChoice) => sameThemeOrNone(a.value, b.value)}
      items={THEME_CHOICES}
      itemToStringLabel={(choice: ThemeChoice) => choice.label}
      onValueChange={(choice: ThemeChoice | null) => {
        if (choice) {
          onChange(choice.value);
        }
      }}
      value={THEME_CHOICES.find((choice) => sameThemeOrNone(choice.value, theme)) ?? THEME_CHOICES[0]}
    >
      <SelectTrigger aria-label={label} autoWidth size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {THEME_CHOICES.map((choice) => (
          <SelectItem key={choice.label} value={choice}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
