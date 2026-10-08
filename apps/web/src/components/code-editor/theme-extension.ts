import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { shortcut } from '@elsewise/components/lib/os';
import type { ResolvedTheme, TextStyle } from '@elsewise/plugin';
import { type Tag, tags as t } from '@lezer/highlight';
import { useMemo } from 'react';
import { useBrightness } from '@/settings/settings';
import { useTheme } from '@/themes/themes';

/**
 * The CSS selector and property that each of the editor's colors is applied to.
 */
const CHROME = {
  background: ['&', 'backgroundColor'],
  foreground: ['&', 'color'],
  caret: ['.cm-cursor, .cm-dropCursor', 'borderLeftColor'],
  selection: [
    '.cm-selectionBackground, .cm-content ::selection, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground',
    'backgroundColor',
  ],
  selectionMatch: ['.cm-selectionMatch', 'backgroundColor'],
  activeLine: ['.cm-activeLine, .cm-activeLineGutter', 'backgroundColor'],
  gutterBackground: ['.cm-gutters', 'backgroundColor'],
  gutterForeground: ['.cm-gutters', 'color'],
  gutterBorder: ['.cm-gutters', 'borderRightColor'],
  visualGuide: ['.cm-visual-guide', 'borderLeftColor'],
  bracketMatch: ['&.cm-focused .cm-matchingBracket', 'backgroundColor'],
  bracketMismatch: ['&.cm-focused .cm-nonmatchingBracket', 'color'],
  searchMatch: ['.cm-searchMatch', 'backgroundColor'],
  searchMatchSelected: ['.cm-searchMatch-selected', 'backgroundColor'],
  searchMatchSelectedBorder: ['.cm-searchMatch-selected', 'outlineColor'],
  panelBackground: ['.cm-panels', 'backgroundColor'],
  tooltipBackground: ['.cm-tooltip', 'backgroundColor'],
  completionSelected: ['.cm-tooltip-autocomplete ul li[aria-selected]', 'backgroundColor'],
  unnecessary: ['.cm-lintRange-unnecessary, .cm-lintRange-unnecessary *', 'color'],
} as const satisfies Record<
  Exclude<keyof ResolvedTheme['editor'], 'tokens' | Diagnostic['severity']>,
  readonly [selector: string, property: string]
>;

/**
 * The Lezer tags that each syntax highlighting token is applied to.
 */
const TOKENS = {
  comment: [t.comment],
  docComment: [t.docComment],
  punctuation: [t.punctuation],
  bracket: [t.bracket],
  operator: [t.operator, t.operatorKeyword],
  keyword: [t.keyword],
  controlKeyword: [t.controlKeyword],
  importKeyword: [t.moduleKeyword],
  declarationKeyword: [t.definitionKeyword],
  modifier: [t.modifier],
  function: [t.function(t.variableName)],
  method: [t.function(t.propertyName)],
  macro: [t.macroName],
  builtin: [t.standard(t.name)],
  type: [t.typeName],
  class: [t.className],
  namespace: [t.namespace],
  annotation: [t.annotation],
  meta: [t.meta],
  // A bare `name` is an identifier the grammar did not classify further.
  variable: [t.variableName, t.name],
  // Lezer has no parameter tag; `local` is the nearest thing grammars emit for one.
  parameter: [t.local(t.variableName)],
  property: [t.propertyName],
  attribute: [t.attributeName],
  tag: [t.tagName],
  constant: [t.constant(t.name), t.literal],
  self: [t.self],
  label: [t.labelName],
  string: [t.string],
  escape: [t.escape],
  regexp: [t.regexp],
  number: [t.number],
  boolean: [t.bool],
  invalid: [t.invalid],
  heading: [t.heading],
  link: [t.link],
  emphasis: [t.emphasis],
  strong: [t.strong],
  strikethrough: [t.strikethrough],
  code: [t.monospace],
  quote: [t.quote],
  list: [t.list],
  rule: [t.contentSeparator],
  inserted: [t.inserted],
  deleted: [t.deleted],
  changed: [t.changed],
} as const satisfies Record<keyof ResolvedTheme['editor']['tokens'], readonly Tag[]>;

const STRIKEOUTS: Partial<Record<string, { ascent: number; position: number; size: number }>> = {
  'JetBrains Mono Variable': { ascent: 1.02, position: 0.32, size: 0.05 },
};

/**
 * The styles that don't depend on the theme.
 */
const METRICS = EditorView.theme({
  '&': { height: '100%' },
  '&.cm-focused': { outline: 'none' },

  '.cm-panels': { backgroundColor: 'transparent', color: 'inherit', zIndex: 'auto' },
  '.cm-panels-top': { borderBottom: 'none' },
  '.cm-searchMatch-selected': { outline: '1px solid transparent', outlineOffset: '0' },

  '.cm-content': { paddingBottom: '8rem' },

  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'var(--font-mono-ligatures)',
    fontSize: 'var(--text-code)',
    lineHeight: 'var(--text-code--line-height)',
  },
  '.cm-scroller::-webkit-scrollbar': { width: '6px', height: '6px' },
  '.cm-scroller::-webkit-scrollbar-track, .cm-scroller::-webkit-scrollbar-corner': { background: 'none' },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    backgroundColor: 'var(--border)',
    borderRadius: '3px',
    backgroundClip: 'content-box',
    border: '1px solid transparent',
  },
  '.cm-scroller::-webkit-scrollbar-thumb:hover': { backgroundColor: 'var(--input)' },
  '.cm-scroller::-webkit-scrollbar-thumb:active': { backgroundColor: 'var(--disabled)' },
  '.cm-gutters': {
    fontSize: 'var(--text-code-gutter)',
    lineHeight: 'var(--text-code-gutter--line-height)',
  },

  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px' },
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 8px 0 8px',
  },
  '.cm-fold-marker': {
    width: '1em',
    height: '1em',
    backgroundColor: 'currentColor',
    mask: 'var(--fold-marker) center / contain no-repeat',
  },
  '.cm-fold-marker:not([data-open])': { transform: 'rotate(-90deg)' },

  '.cm-lintRange.cm-lintRange-deprecated': { backgroundImage: 'none', textDecoration: 'line-through' },
  '.cm-lintRange.cm-lintRange-unnecessary': { backgroundImage: 'none' },

  '.cm-tooltip.cm-tooltip-hover, .cm-tooltip.cm-tooltip-autocomplete, .cm-tooltip.cm-completionInfo, .cm-tooltip.cm-lsp-signatures':
    {
      border: 'none',
      borderRadius: 'var(--radius)',
      boxShadow:
        '0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      color: 'var(--popover-foreground)',
    },
  '.cm-tooltip.cm-tooltip-hover, .cm-tooltip.cm-completionInfo': {
    fontFamily: 'var(--font-sans)',
    fontVariantLigatures: 'var(--font-sans-ligatures)',
    fontSize: 'var(--text-base)',
    lineHeight: 'var(--text-base--line-height)',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  '.cm-tooltip.cm-tooltip-hover': { maxWidth: '500px' },

  '.cm-tooltip-hover .cm-tooltip-section:not(:first-child)': { borderTop: '1px solid var(--border)' },
  '.cm-tooltip-hover .cm-diagnostic': { margin: '0', padding: '8px 12px', borderLeft: 'none' },
  '.cm-tooltip-hover .cm-diagnostic + .cm-diagnostic': { borderTop: '1px solid var(--border)' },
  '.cm-tooltip-hover .cm-diagnosticText': { display: 'block' },
  '.cm-tooltip-hover .cm-diagnosticMeta': {
    marginTop: '2px',
    color: 'var(--text-3)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--text-sm--line-height)',
    whiteSpace: 'normal',
  },
  '.cm-tooltip-hover .cm-diagnosticMeta a': { color: 'inherit' },

  // CodeMirror splits a selector at every comma, so these can't use `:is()`.
  '.cm-lsp-definition': { padding: '8px 12px' },
  '.cm-tooltip-hover pre, .cm-completionInfo pre': {
    margin: '0',
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'var(--font-mono-ligatures)',
    fontSize: 'var(--text-code)',
    lineHeight: 'var(--text-code--line-height)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  '.cm-lsp-content': { padding: '8px 12px', overflowWrap: 'anywhere' },
  '.cm-lsp-definition + .cm-lsp-content': { borderTop: '1px solid var(--border)' },
  '.cm-lsp-content > *, .cm-lsp-content li > ul, .cm-lsp-content li > ol': { margin: '0' },
  '.cm-lsp-content > * + *': { marginTop: '8px' },
  '.cm-lsp-content h1, .cm-lsp-content h2, .cm-lsp-content h3, .cm-lsp-content h4, .cm-lsp-content h5, .cm-lsp-content h6':
    { fontSize: 'inherit', fontWeight: '500' },
  '.cm-lsp-content ul, .cm-lsp-content ol': { paddingLeft: '18px' },
  '.cm-lsp-content ul': { listStyle: 'disc' },
  '.cm-lsp-content ol': { listStyle: 'decimal' },
  '.cm-lsp-content li::marker': { color: 'var(--text-3)' },
  '.cm-lsp-content blockquote': {
    paddingLeft: '8px',
    borderLeft: '2px solid var(--border)',
    color: 'var(--text-2)',
  },
  '.cm-lsp-content hr': { border: 'none', borderTop: '1px solid var(--border)' },
  '.cm-lsp-content pre': {
    padding: '8px',
    borderRadius: 'calc(var(--radius) * 0.8)',
    backgroundColor: 'var(--layer-selected)',
  },
  '.cm-tooltip-hover code, .cm-completionInfo code': {
    padding: '1px 4px',
    borderRadius: '4px',
    backgroundColor: 'var(--layer-selected)',
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'var(--font-mono-ligatures)',
    fontSize: 'var(--text-code)',
  },
  '.cm-tooltip-hover pre code, .cm-completionInfo pre code': { padding: '0', backgroundColor: 'transparent' },
  '.cm-tooltip-hover a, .cm-completionInfo a': { color: 'var(--link)', textDecoration: 'underline' },
  '.cm-tooltip-hover a:hover, .cm-completionInfo a:hover': { color: 'var(--link-hover)' },
  '.cm-tooltip-hover a[href^="http"]::after, .cm-completionInfo a[href^="http"]::after': {
    content: '""',
    display: 'inline-block',
    width: '0.85em',
    height: '0.85em',
    marginLeft: '2px',
    backgroundColor: 'currentColor',
    mask: 'var(--external-link) center / contain no-repeat',
  },

  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    padding: '4px',
    minWidth: '240px',
    maxWidth: '500px',
    maxHeight: 'calc(10 * 22px + 8px)',
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'var(--font-mono-ligatures)',
    fontSize: 'var(--text-code)',
    lineHeight: 'var(--text-code--line-height)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    height: '22px',
    padding: '0 8px 0 6px',
    borderRadius: 'calc(var(--radius) - 2px)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { color: 'inherit' },
  '.cm-completionKind': { flex: 'none', width: '16px', marginRight: '6px' },
  // A row that doesn't fit cuts the text after its label first, then the label. The detail is cut at 40% of the row.
  '.cm-completionLabel, .cm-completionTail, .cm-completionDetail': {
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '.cm-completionLabel': { flex: '0 1 auto' },
  // `pre` keeps the space servers put before an import's path.
  '.cm-completionTail': { flex: '0 10000 auto', whiteSpace: 'pre', color: 'var(--text-3)' },
  '.cm-completionDetail': {
    flex: 'none',
    maxWidth: '40%',
    marginLeft: 'auto',
    paddingLeft: '24px',
    color: 'var(--text-3)',
    fontStyle: 'normal',
  },

  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--link)', fontWeight: '600' },
  '.cm-completion-deprecated .cm-completionLabel': { color: 'var(--text-3)' },
  '.cm-completion-deprecated .cm-completionLabel, .cm-completion-deprecated .cm-completionTail': {
    textDecoration: 'line-through',
  },
  '.cm-completion-deprecated .cm-completionMatchedText': { color: 'inherit', fontWeight: 'inherit' },
  '.cm-completionListIncompleteTop:before, .cm-completionListIncompleteBottom:after': { color: 'var(--text-3)' },
  '.cm-tooltip-autocomplete::after': {
    content: JSON.stringify(`${shortcut('Enter')} insert · ${shortcut('Tab')} replace`),
    display: 'block',
    padding: '4px 10px',
    borderTop: '1px solid var(--border)',
    color: 'var(--text-3)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--text-sm--line-height)',
  },
  '.cm-tooltip.cm-completionInfo': { width: '360px', padding: '0', whiteSpace: 'normal' },
  '.cm-completionInfo.cm-completionInfo-right': { marginLeft: '4px' },
  '.cm-completionInfo.cm-completionInfo-left': { marginRight: '4px' },

  '.cm-tooltip.cm-lsp-signatures > ul': {
    position: 'relative',
    margin: '0',
    padding: '4px',
    minWidth: '240px',
    maxWidth: '500px',
    maxHeight: 'calc(10 * 22px + 8px)',
    overflowY: 'auto',
    listStyle: 'none',
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'var(--font-mono-ligatures)',
    fontSize: 'var(--text-code)',
    lineHeight: 'var(--text-code--line-height)',
  },
  // A signature too long for one line indents the lines it wraps onto by four characters.
  '.cm-tooltip.cm-lsp-signatures > ul > li': {
    padding: '2px 8px 2px calc(8px + 4ch)',
    textIndent: '-4ch',
  },
  '.cm-tooltip.cm-lsp-signatures > ul > li + li': { borderTop: '1px solid var(--border)' },
  '.cm-lsp-signature-part': { whiteSpace: 'nowrap' },
  // 600, against DESIGN.md, since JetBrains Mono at 500 barely differs from 400.
  '.cm-lsp-active-parameter': { fontWeight: '600' },
  '.cm-lsp-signature-inapplicable, .cm-lsp-signature-inapplicable *': { color: 'var(--text-3)' },
});

/**
 * Returns the CodeMirror extension that applies the editor's theme.
 */
export function useThemeExtension(): Extension {
  const { editor } = useTheme();
  const brightness = useBrightness();

  return useMemo(() => {
    const spec: Record<string, Record<string, string>> = {};
    for (const [role, [selector, property]] of Object.entries(CHROME) as [
      keyof typeof CHROME,
      readonly [string, string],
    ][]) {
      spec[selector] ??= {};
      spec[selector][property] = editor[role];
    }

    // Draws the squiggles like CodeMirror does, in the editor's colors.
    for (const severity of ['error', 'warning', 'info'] as const) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${editor[severity]}" fill="none" stroke-width=".7"/></svg>`;
      spec[`.cm-lintRange-${severity}`] = { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` };
    }

    const dots = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><circle cx="1.5" cy="1.5" r=".8" fill="${editor.hint}"/></svg>`;
    spec['.cm-lintRange-hint'] = { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(dots)}")` };

    // Chromium ignores a font's `yStrikeoutPosition` and `yStrikeoutSize`, making strikeouts for JetBrains Mono look
    // terrible. See https://issues.chromium.org/issues/40066668.
    const family = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-mono')
      .split(',')[0]
      .trim()
      .replace(/^['"]|['"]$/g, '');
    const strikeout = STRIKEOUTS[family];
    if (strikeout) {
      const propeerties = {
        backgroundImage: 'linear-gradient(currentColor, currentColor)',
        backgroundPosition: `0 calc(round(${strikeout.ascent}em, 1px) - ${strikeout.position}em)`,
        backgroundSize: `100% ${strikeout.size}em`,
        textDecoration: 'none',
      };

      spec['.cm-lintRange.cm-lintRange-deprecated'] = propeerties;
      spec['.cm-completion-deprecated .cm-completionLabel, .cm-completion-deprecated .cm-completionTail'] = {
        ...propeerties,
        backgroundRepeat: 'no-repeat',
        lineHeight: 'normal',
      };
    }

    const styles = (Object.entries(editor.tokens) as [keyof typeof TOKENS, TextStyle][]).map(([role, style]) => ({
      tag: [...TOKENS[role]],
      color: style.color,
      fontWeight: 'bold' in style && style.bold ? 'bold' : undefined,
      fontStyle: 'italic' in style && style.italic ? 'italic' : undefined,
      textDecoration:
        [
          'underline' in style && style.underline && 'underline',
          'strikethrough' in style && style.strikethrough && 'line-through',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
    }));

    return [
      EditorView.theme(spec, { dark: brightness === 'dark' }),
      syntaxHighlighting(HighlightStyle.define(styles)),
      METRICS,
    ];
  }, [editor, brightness]);
}
