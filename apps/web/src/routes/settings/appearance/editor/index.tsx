import type { DiffLayout, Settings } from '@elsewise/bridge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Separator } from '@elsewise/components/components/separator';
import { Row, SplitPage } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import type { SettingsSearchTerm } from '@elsewise/plugin';
import { createFileRoute } from '@tanstack/react-router';
import { DEFAULT_MONO_FONTS, monoFontStack } from '@/settings/fonts';
import { LANGUAGES } from '@/settings/languages';
import { useSettings, useUpdateSettings } from '@/settings/settings';
import { FontRows } from '../../-font-rows';
import { LineHeightInput } from '../../-line-height-input';
import { ThemeSelect } from '../-theme';
import { CompletionDocumentationHelp, HighlightUsagesHelp, ScrollbarMarkersHelp } from './-help';
import { LanguageRows } from './-language-rows';
import { Preview } from './-preview';

export const Route = createFileRoute('/settings/appearance/editor/')({ component: Editor });

export const EDITOR_TERMS = {
  theme: { label: 'Theme', keywords: ['colors', 'color scheme', 'syntax highlighting', 'light', 'dark'] },
  font: { label: 'Font', keywords: ['font family', 'typeface', 'monospace', 'font size', 'code font'] },
  lineHeight: { label: 'Line height', keywords: ['line spacing', 'leading', 'row height', 'code font'] },
  ligatures: { label: 'Ligatures', keywords: ['font', 'glyphs', 'monospace', 'code font'] },
  lineNumbers: { label: 'Line numbers', keywords: ['gutter', 'numbering', 'show line numbers'] },
  lineWrapping: { label: 'Line wrapping', keywords: ['word wrap', 'soft wrap', 'long lines', 'horizontal scrolling'] },
  tabSize: { label: 'Tab width', keywords: ['tab size', 'columns', 'indentation'] },
  indentUnit: { label: 'Indent with', keywords: ['tabs', 'spaces', 'indentation', 'indent size'] },
  lineSeparator: { label: 'Line endings', keywords: ['lf', 'crlf', 'eol', 'newline', 'line separator'] },
  visualGuides: { label: 'Visual guides', keywords: ['rulers', 'column guides', 'vertical rule', 'margin'] },
  completionDocumentation: { label: 'Completion documentation', keywords: ['autocomplete', 'docs', 'popup', 'info'] },
  highlightUsages: { label: 'Highlight usages', keywords: ['occurrences', 'symbol', 'references', 'selection'] },
  scrollbarMarkers: { label: 'Scrollbar markers', keywords: ['overview', 'marks', 'diagnostics', 'matches'] },
  diffLayout: { label: 'Diff layout', keywords: ['compare', 'split', 'unified', 'side by side', 'inline'] },
  languages: { label: 'Languages', keywords: ['overrides', 'per language'] },
} as const satisfies Record<keyof Settings['appearance']['editor'] | 'lineHeight' | 'ligatures', SettingsSearchTerm>;

const DIFF_LAYOUTS: Record<DiffLayout, string> = { split: 'Split', unified: 'Unified' };

export function Editor() {
  const editor = useSettings((settings) => settings.appearance.editor);
  const update = useUpdateSettings();
  const set = (changes: Partial<typeof editor>) =>
    update((settings) => ({
      ...settings,
      appearance: { ...settings.appearance, editor: { ...settings.appearance.editor, ...changes } },
    }));

  return (
    <SplitPage preview={<Preview language={LANGUAGES.Rust} />} title="Editor">
      <Row
        id="theme"
        label={EDITOR_TERMS.theme.label}
        description="The editor's colors."
        help="A theme without a light or dark variant uses the default theme's variant."
      >
        <ThemeSelect label={EDITOR_TERMS.theme.label} onChange={(theme) => set({ theme })} theme={editor.theme} />
      </Row>

      <Separator />

      <FontRows
        defaults={DEFAULT_MONO_FONTS}
        description="The editor's font."
        font={editor.font}
        onChange={(font) => set({ font })}
        stack={monoFontStack}
        terms={EDITOR_TERMS}
      >
        <Row
          id="lineHeight"
          label={EDITOR_TERMS.lineHeight.label}
          description="A multiple of the font size, between 1 and 2.5."
        >
          <LineHeightInput
            label={EDITOR_TERMS.lineHeight.label}
            onChange={(lineHeight) => set({ font: { ...editor.font, lineHeight } })}
            value={editor.font.lineHeight}
          />
        </Row>
      </FontRows>

      <Separator />

      <LanguageRows onChange={set} terms={EDITOR_TERMS} values={editor} />

      <Separator />

      <Row id="lineNumbers" label={EDITOR_TERMS.lineNumbers.label} description="Shown beside the code.">
        <Switch
          aria-label={EDITOR_TERMS.lineNumbers.label}
          checked={editor.lineNumbers}
          onCheckedChange={(lineNumbers) => set({ lineNumbers })}
        />
      </Row>

      <Row
        id="lineWrapping"
        label={EDITOR_TERMS.lineWrapping.label}
        description="Long lines continue on the next line instead of scrolling horizontally."
      >
        <Switch
          aria-label={EDITOR_TERMS.lineWrapping.label}
          checked={editor.lineWrapping}
          onCheckedChange={(lineWrapping) => set({ lineWrapping })}
        />
      </Row>

      <Row id="diffLayout" label={EDITOR_TERMS.diffLayout.label} description="The default layout when opening a diff.">
        <Select
          items={DIFF_LAYOUTS}
          onValueChange={(diffLayout) => {
            if (diffLayout) {
              set({ diffLayout });
            }
          }}
          value={editor.diffLayout}
        >
          <SelectTrigger aria-label={EDITOR_TERMS.diffLayout.label} autoWidth size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DIFF_LAYOUTS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row
        id="highlightUsages"
        label={EDITOR_TERMS.highlightUsages.label}
        description="Highlights usages of the symbol under"
        help={<HighlightUsagesHelp>Requires a language server.</HighlightUsagesHelp>}
      >
        <Switch
          aria-label={EDITOR_TERMS.highlightUsages.label}
          checked={editor.highlightUsages}
          onCheckedChange={(highlightUsages) => set({ highlightUsages })}
        />
      </Row>

      <Row
        id="completionDocumentation"
        label={EDITOR_TERMS.completionDocumentation.label}
        description="Show a completion's documentation beside the list."
        help={<CompletionDocumentationHelp>Documentation may require a language server.</CompletionDocumentationHelp>}
      >
        <Switch
          aria-label={EDITOR_TERMS.completionDocumentation.label}
          checked={editor.completionDocumentation}
          onCheckedChange={(completionDocumentation) => set({ completionDocumentation })}
        />
      </Row>

      <Row
        id="scrollbarMarkers"
        label={EDITOR_TERMS.scrollbarMarkers.label}
        description="Mark diagnostics, usages and search matches on the scrollbar."
        help={<ScrollbarMarkersHelp>Diagnostics may require a language server.</ScrollbarMarkersHelp>}
      >
        <Switch
          aria-label={EDITOR_TERMS.scrollbarMarkers.label}
          checked={editor.scrollbarMarkers}
          onCheckedChange={(scrollbarMarkers) => set({ scrollbarMarkers })}
        />
      </Row>
    </SplitPage>
  );
}
