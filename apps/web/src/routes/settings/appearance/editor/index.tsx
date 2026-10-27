import type { Settings } from '@elsewise/bridge';
import type { SettingsSearchTerm } from '@elsewise/plugin';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/appearance/editor')({ component: Editor });

export const EDITOR_TERMS = {
  theme: { label: 'Theme', keywords: ['colors', 'color scheme', 'syntax highlighting', 'light', 'dark'] },
  font: { label: 'Font', keywords: ['font family', 'typeface', 'monospace', 'font size', 'code font'] },
  ligatures: { label: 'Ligatures', keywords: ['font', 'glyphs', 'monospace', 'code font'] },
  lineNumbers: { label: 'Line numbers', keywords: ['gutter', 'numbering', 'show line numbers'] },
  lineWrapping: { label: 'Line wrapping', keywords: ['word wrap', 'soft wrap', 'long lines', 'horizontal scrolling'] },
  tabSize: { label: 'Tab width', keywords: ['tab size', 'columns', 'indentation'] },
  indentUnit: { label: 'Indent with', keywords: ['tabs', 'spaces', 'indentation', 'indent size'] },
  lineSeparator: { label: 'Line endings', keywords: ['lf', 'crlf', 'eol', 'newline', 'line separator'] },
  visualGuides: { label: 'Visual guides', keywords: ['rulers', 'column guides', 'vertical rule', 'margin'] },
  completionDocumentation: { label: 'Completion documentation', keywords: ['autocomplete', 'docs', 'popup', 'info'] },
  highlightUsages: { label: 'Highlight usages', keywords: ['occurrences', 'symbol', 'references', 'selection'] },
  stripe: { label: 'Stripe', keywords: ['scrollbar', 'overview', 'marks', 'diagnostics', 'matches'] },
  diffLayout: { label: 'Diff layout', keywords: ['compare', 'split', 'unified', 'side by side', 'inline'] },
  languages: { label: 'Languages', keywords: ['overrides', 'per language'] },
} as const satisfies Record<keyof Settings['appearance']['editor'] | 'ligatures', SettingsSearchTerm>;

export function Editor() {
  return (
    <div className="flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-heading-lg">Editor</h1>
    </div>
  );
}
