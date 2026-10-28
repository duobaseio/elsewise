import type { Brightness, Settings } from '@elsewise/bridge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Separator } from '@elsewise/components/components/separator';
import { Page, Row } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import { DEFAULT_ROUTES, type SettingsSearchTerm } from '@elsewise/plugin';
import { createFileRoute, Link } from '@tanstack/react-router';
import { sameTheme } from '@/appearance/themes';
import { DEFAULT_FONTS, fontStack } from '@/settings/fonts';
import { useSettings, useUpdateSettings } from '@/settings/settings';
import { FontRows } from '../-font-rows';
import { THEME_ITEMS } from './-theme';

export const Route = createFileRoute('/settings/local/appearance/general')({ component: General });

export const GENERAL_TERMS = {
  brightness: { label: 'Brightness', keywords: ['theme', 'dark mode', 'system', 'light', 'dark'] },
  theme: { label: 'Theme', keywords: ['colors', 'color scheme', 'light', 'dark'] },
  font: { label: 'Font', keywords: ['font family', 'typeface', 'font size', 'ui font'] },
  ligatures: { label: 'Ligatures', keywords: ['font', 'glyphs', 'typography'] },
  gitStatusBadges: {
    label: 'Git status badges',
    keywords: ['file tree', 'letters', 'markers', 'decorations', 'modified', 'changed files', 'git'],
  },
} as const satisfies Record<keyof Settings['appearance']['general'] | 'ligatures', SettingsSearchTerm>;

const BRIGHTNESS: Record<Brightness, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function General() {
  const general = useSettings((settings) => settings.appearance.general);
  const update = useUpdateSettings();
  const set = (changes: Partial<typeof general>) =>
    update((settings) => ({
      ...settings,
      appearance: { ...settings.appearance, general: { ...settings.appearance.general, ...changes } },
    }));

  return (
    <Page title="General">
      <Row
        id="brightness"
        label={GENERAL_TERMS.brightness.label}
        description="The interface's light or dark appearance."
      >
        <Select
          items={BRIGHTNESS}
          onValueChange={(brightness) => {
            if (brightness) {
              set({ brightness });
            }
          }}
          value={general.brightness}
        >
          <SelectTrigger aria-label={GENERAL_TERMS.brightness.label} autoWidth size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BRIGHTNESS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row id="theme" label={GENERAL_TERMS.theme.label} description="The interface's colors.">
        <Select
          isItemEqualToValue={sameTheme}
          items={THEME_ITEMS}
          itemToStringLabel={(theme) => THEME_ITEMS.find((item) => sameTheme(item.value, theme))?.label ?? ''}
          onValueChange={(theme) => {
            if (theme) {
              set({ theme });
            }
          }}
          value={general.theme}
        >
          <SelectTrigger aria-label={GENERAL_TERMS.theme.label} autoWidth size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEME_ITEMS.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Separator />

      <FontRows
        defaults={DEFAULT_FONTS}
        description={
          <>
            The interface's font.{' '}
            <Link
              className="text-link underline underline-offset-4 hover:text-link-hover"
              replace
              to={DEFAULT_ROUTES.settings.editor}
            >
              Editor
            </Link>{' '}
            and{' '}
            <Link
              className="text-link underline underline-offset-4 hover:text-link-hover"
              replace
              to={DEFAULT_ROUTES.settings.terminal}
            >
              terminal
            </Link>{' '}
            fonts are set separately.
          </>
        }
        font={general.font}
        onChange={(font) => set({ font })}
        stack={fontStack}
        terms={GENERAL_TERMS}
      />

      <Separator />

      <Row
        id="gitStatusBadges"
        label={GENERAL_TERMS.gitStatusBadges.label}
        description="Indicate changed files in the file tree with a badge."
      >
        <Switch
          aria-label={GENERAL_TERMS.gitStatusBadges.label}
          checked={general.gitStatusBadges}
          onCheckedChange={(gitStatusBadges) => set({ gitStatusBadges })}
        />
      </Row>
    </Page>
  );
}
