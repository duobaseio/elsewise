import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Separator } from '@elsewise/components/components/separator';
import { Page, Row } from '@elsewise/components/components/settings';
import {
  type Brightness,
  DEFAULT_ROUTES,
  type FrontendSettings,
  type SettingsSearchTerm,
} from '@elsewise/frontend-plugin';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DEFAULT_FONTS, fontStack } from '@/settings/fonts';
import { useSettings, useUpdateSettingsSection } from '@/settings/settings';
import { FontRows } from '../-font-rows';
import { ThemeSelect } from '../-theme';

export const Route = createFileRoute('/settings/local/appearance/')({ component: Appearance });

export const APPEARANCE_TERMS = {
  brightness: { label: 'Brightness', keywords: ['theme', 'dark mode', 'system', 'light', 'dark'] },
  theme: { label: 'Theme', keywords: ['colors', 'color scheme', 'light', 'dark'] },
  font: { label: 'Font', keywords: ['font family', 'typeface', 'font size', 'ui font'] },
  ligatures: { label: 'Ligatures', keywords: ['font', 'glyphs', 'typography'] },
} as const satisfies Record<keyof FrontendSettings['appearance'] | 'ligatures', SettingsSearchTerm>;

const BRIGHTNESS: Record<Brightness, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function Appearance() {
  const appearance = useSettings((settings) => settings.appearance);
  const set = useUpdateSettingsSection('appearance');

  return (
    <Page title="Appearance">
      <Row
        id="brightness"
        label={APPEARANCE_TERMS.brightness.label}
        description="The interface's light or dark appearance."
      >
        <Select
          items={BRIGHTNESS}
          onValueChange={(brightness) => {
            if (brightness) {
              set({ brightness });
            }
          }}
          value={appearance.brightness}
        >
          <SelectTrigger aria-label={APPEARANCE_TERMS.brightness.label} autoWidth size="sm">
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

      <Row id="theme" label={APPEARANCE_TERMS.theme.label} description="The interface's colors.">
        <ThemeSelect
          label={APPEARANCE_TERMS.theme.label}
          theme={appearance.theme}
          onChange={(theme) => set({ theme })}
        />
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
        font={appearance.font}
        onChange={(font) => set({ font })}
        stack={fontStack}
        terms={APPEARANCE_TERMS}
      />
    </Page>
  );
}
