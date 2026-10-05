import { closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentLess, insertTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from '@codemirror/view';
import type { LineSeparator } from '@elsewise/bridge';
import { iconUrl, useIcons } from '@elsewise/components/components/icon';
import { OS } from '@elsewise/components/lib/os';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useRef } from 'react';
import { EditorContextMenu, rightClickContextMenu } from '@/components/code-editor/context-menu';
import { useSearchExtension } from '@/components/code-editor/search-bar';
import { useSettingsExtension } from '@/components/code-editor/settings-extension';
import { useThemeExtension } from '@/components/code-editor/theme-extension';
import { useEditorSettings, useSettings } from '@/settings/settings';

const THEME = new Compartment();
const LANGUAGE = new Compartment();
const SETTINGS = new Compartment();

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

export interface CodeEditorProps {
  /**
   * The file's path. Used to detect its language.
   */
  path: string;
  code: string;
}

/**
 * A code editor.
 */
export function CodeEditor({ path, code }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);

  const description = LanguageDescription.matchFilename(languages, path);
  const { data: language } = useQuery({
    queryKey: ['language', description?.name ?? null],
    queryFn: () => description?.load() ?? null,
    enabled: description != null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const theme = useThemeExtension();
  const { search, portal } = useSearchExtension();
  const settings = useSettingsExtension(description?.name);
  const icons = useIcons();

  const font = useSettings((settings) => settings.appearance.editor.font);
  const previousFont = useRef(font);

  // Defaults to the line separator the file already uses, or the platform's if the file has none.
  const lineSeparator: LineSeparator =
    useEditorSettings(description?.name, 'lineSeparator') ??
    (code.includes('\r\n') || (!code.includes('\n') && OS === 'windows') ? '\r\n' : '\n');



  // biome-ignore lint/correctness/useExhaustiveDependencies: the seeded values are deliberately not dependencies.
  useEffect(() => {
    if (host.current == null) {
      return;
    }

    view.current = new EditorView({
      state: EditorState.create({
        doc: code,
        extensions: [
          THEME.of(theme),
          METRICS,
          history(),
          search,

          SETTINGS.of(settings),
          // This cannot be inside SETTINGS because changing the line separator requires the entire doc to be reparsed.
          EditorState.lineSeparator.of(lineSeparator),

          LANGUAGE.of(language ?? []),
          closeBrackets(),
          bracketMatching(),
          // Has to be after lineNumbers to ensure the fold icon is to the right of it.
          foldGutter({
            markerDOM: (open) => {
              const marker = document.createElement('span');
              marker.className = 'cm-fold-marker';
              if (open) {
                marker.dataset.open = '';
              }
              return marker;
            },
          }),

          EditorState.allowMultipleSelections.of(true),
          drawSelection(),
          crosshairCursor(),
          rectangularSelection(),

          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSelectionMatches(),
          highlightSpecialChars(),
          rightClickContextMenu,

          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            { key: 'Tab', run: insertTab, shift: indentLess },
          ]),
        ],
      }),
      parent: host.current,
    });

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [code, lineSeparator]);

  useEffect(() => {
    view.current?.dispatch({ effects: LANGUAGE.reconfigure(language ?? []) });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({ effects: THEME.reconfigure(theme) });
  }, [theme]);

  useEffect(() => {
    view.current?.dispatch({ effects: SETTINGS.reconfigure(settings) });
  }, [settings]);

  // Rebuilds the editor when its font changes. CodeMirror caches measurements such as the character width, and does
  // not notice a font that changes through a CSS variable.
  useEffect(() => {
    const editor = view.current;
    if (editor === null || previousFont.current === font) {
      return;
    }

    previousFont.current = font;
    const top = editor.lineBlockAtHeight(editor.scrollDOM.scrollTop).from;

    editor.setState(editor.state);
    editor.dispatch({ effects: EditorView.scrollIntoView(top, { y: 'start' }) });
  }, [font]);

  return (
    <>
      <EditorContextMenu view={view}>
        <div
          className="h-full"
          ref={host}
          // The icon is passed as a CSS variable since CodeMirror creates the fold markers outside React.
          style={{ '--fold-marker': `url("${iconUrl(icons.expand)}")` } as CSSProperties}
        />
      </EditorContextMenu>
      {portal}
    </>
  );
}
