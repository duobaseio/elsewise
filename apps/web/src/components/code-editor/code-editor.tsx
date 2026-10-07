import { closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentLess, insertTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, LanguageDescription } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
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
import { type CSSProperties, useEffect, useMemo, useRef } from 'react';
import { CodeEditorContextMenu, rightClickContextMenu } from '@/components/code-editor/context-menu/context-menu';
import { useLanguageServerExtension } from '@/components/code-editor/language-server-extension';
import { useSearchExtension } from '@/components/code-editor/search/search-bar';
import { useSettingsExtension } from '@/components/code-editor/settings-extension';
import { useThemeExtension } from '@/components/code-editor/theme-extension';
import { useEditorAdditions } from '@/plugins/editor';
import { useEditorSettings, useSettings } from '@/settings/settings';

const PLUGINS = new Compartment();
const THEME = new Compartment();
const LANGUAGE = new Compartment();
const LANGUAGE_SERVER = new Compartment();
const SETTINGS = new Compartment();

export interface CodeEditorProps {
  /**
   * The root of the worktree that the file is in, ending in `/`.
   */
  root?: URL;
  /**
   * The file's path. Used to detect its language.
   */
  path: string;
  code: string;
}

/**
 * A code editor.
 */
export function CodeEditor({ path, code, root }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);

  const plugins = usePluginsExtension(path);
  const theme = useThemeExtension();
  const languages = useEditorAdditions((additions) => additions.languages);
  const description = LanguageDescription.matchFilename(languages, path);
  const { search, portal } = useSearchExtension();
  const settings = useSettingsExtension(description?.name);
  const languageServer = useLanguageServerExtension(root, description?.name, path);
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

    let state = EditorState.create({
      doc: code,
      extensions: [
        // Has to be first to let a plugin's theme and keymap take precedence over Elsewise's.
        PLUGINS.of([]),
        THEME.of(theme),
        history(),
        search,

        SETTINGS.of(settings),
        // This cannot be inside SETTINGS because changing the line separator requires the entire doc to be reparsed.
        EditorState.lineSeparator.of(lineSeparator),

        LANGUAGE.of(description?.support ?? []),
        LANGUAGE_SERVER.of(languageServer),
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
    });
    // Applies the plugins' extensions separately to keep a broken plugin from leaving the file without an editor.
    try {
      state = state.update({ effects: PLUGINS.reconfigure(plugins) }).state;
    } catch (error) {
      console.error('Plugin extension failed', error);
    }

    view.current = new EditorView({ state, parent: host.current });

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [code, lineSeparator]);

  useEffect(() => {
    view.current?.dispatch({ effects: LANGUAGE.reconfigure(description?.support ?? []) });
    if (description === null || description.support !== undefined) {
      return;
    }

    // Keeps a grammar that loads late from being applied to another file's language.
    let live = true;
    description.load().then(
      (support) => {
        if (live) {
          view.current?.dispatch({ effects: LANGUAGE.reconfigure(support) });
        }
      },
      (error) => {
        console.error(`Language ${description.name} failed to load`, error);
      },
    );

    return () => {
      live = false;
    };
  }, [description]);

  useEffect(() => {
    try {
      view.current?.dispatch({ effects: PLUGINS.reconfigure(plugins) });
    } catch (error) {
      console.error('Plugin extension failed', error);
      view.current?.dispatch({ effects: PLUGINS.reconfigure([]) });
    }
  }, [plugins]);

  useEffect(() => {
    view.current?.dispatch({ effects: THEME.reconfigure(theme) });
  }, [theme]);

  useEffect(() => {
    view.current?.dispatch({ effects: SETTINGS.reconfigure(settings) });
  }, [settings]);

  useEffect(() => {
    view.current?.dispatch({ effects: LANGUAGE_SERVER.reconfigure(languageServer) });
  }, [languageServer]);

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
      <CodeEditorContextMenu view={view}>
        <div
          className="h-full"
          ref={host}
          // The icons are passed as CSS variables since CodeMirror creates the fold markers and tooltips outside React.
          style={
            {
              '--fold-marker': `url("${iconUrl(icons.expand)}")`,
              '--external-link': `url("${iconUrl(icons.external)}")`,
            } as CSSProperties
          }
        />
      </CodeEditorContextMenu>
      {portal}
    </>
  );
}

function usePluginsExtension(path: string): Extension {
  const extensions = useEditorAdditions((additions) => additions.extensions);

  return useMemo(() => {
    try {
      return extensions.map((extension) => (typeof extension === 'function' ? extension({ path }) : extension));
    } catch (error) {
      console.error('Plugin extension failed', error);
      return [];
    }
  }, [extensions, path]);
}
