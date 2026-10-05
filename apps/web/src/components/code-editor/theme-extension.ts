import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
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
} as const satisfies Record<
  Exclude<keyof ResolvedTheme['editor'], 'tokens'>,
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

/**
 * The styles that don't depend on the theme.
 */
const METRICS = EditorView.theme({
  '&': { height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-panels': { backgroundColor: 'transparent', color: 'inherit', zIndex: 'auto' },
  '.cm-panels-top': { borderBottom: 'none' },
  '.cm-searchMatch-selected': { outline: '1px solid transparent', outlineOffset: '-1px' },
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
