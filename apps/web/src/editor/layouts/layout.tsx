import { closeBrackets } from '@codemirror/autocomplete';
import { history, historyField, simplifySelection, standardKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, LanguageDescription } from '@codemirror/language';
import { Compartment, type EditorSelection, EditorState, type Extension, Prec, type Text } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from '@codemirror/view';
import type { LineSeparator } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { EDITOR_DOCUMENT, type EditorDocument, type EditorDocumentLayout } from '@elsewise/plugin';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useCommandManager } from '@/command/command-manager';
import { editorKeymap } from '@/command/keymap';
import { actions } from '@/editor/actions';
import { drawActiveLine } from '@/editor/active-line';
import { completion } from '@/editor/completion';
import { RIGHT_CLICK_CONTEXT_MENU } from '@/editor/context-menu';
import { COMMANDS, useEditorManager } from '@/editor/editor-manager';
import { format } from '@/editor/format';
import { hover } from '@/editor/hover';
import { useLanguageServerExtension } from '@/editor/lsp/language-servers';
import { navigation } from '@/editor/navigation';
import { scrollbarsKeepFocus } from '@/editor/scroll';
import { useSearchExtension } from '@/editor/search/search-bar';
import { useSettingsExtension } from '@/editor/settings';
import { selectionMatches } from '@/editor/stripe/selection-matches';
import { useThemeExtension } from '@/editor/theme';
import { useToolbarExtension } from '@/editor/toolbar';
import { useEditorSettings, useSettings } from '@/settings/settings';

export const PLUGINS = new Compartment();
export const DOCUMENT = new Compartment();
export const KEYS = new Compartment();
export const THEME = new Compartment();
export const LANGUAGE = new Compartment();
export const LANGUAGE_SERVER = new Compartment();
export const SETTINGS = new Compartment();
export const DIFF = new Compartment();
export const FOLDING = new Compartment();

/**
 * The state of a view, which the next view continues when the layout changes.
 */
export interface EditorSession {
  /**
   * The type of the source that the view showed. Only a view of the same type continues the session.
   */
  readonly source: EditorSource['type'];
  /**
   * The code that the view was built from, before any edits.
   */
  readonly code: string;
  /**
   * The document, with the unsaved edits.
   */
  readonly doc: Text;
  /**
   * The position of the line at the top of the view.
   */
  readonly top: number;
  readonly selection: EditorSelection;
  /**
   * The undo history, or undefined if the view had none.
   */
  readonly history: unknown;
}

export function sessionOf(view: EditorView, source: EditorSource['type'], code: string): EditorSession {
  return {
    source,
    code,
    doc: view.state.doc,
    top: view.lineBlockAtHeight(view.scrollDOM.scrollTop).from,
    selection: view.state.selection,
    history: view.state.field(historyField, false),
  };
}

export function sessionHistory(session: EditorSession | null): Extension {
  return session === null || session.history === undefined ? [] : historyField.init(() => session.history);
}

export type EditorSource = { readonly type: 'workingTree'; readonly root?: URL } | { readonly type: 'blob' };

export interface EditorExtensionsOptions {
  readonly source: EditorSource;
  /**
   * The file's path, relative to the worktree's root, e.g. `src/main.ts`.
   */
  readonly relativePath: string;
  readonly code: string;
  readonly layout: EditorDocumentLayout;
}

export interface EditorExtensions {
  readonly document: EditorDocument | null;
  readonly core: Extension;
  readonly plugins: Extension;
  readonly portal: ReactNode;
  readonly lineSeparator: LineSeparator;
}

/**
 * Returns the extensions, plugins, portal and line separator for a view of the file from `source`.
 *
 * The view has to be rebuilt when the source's type changes, since the extensions differ by it.
 */
export function useEditorExtensions(
  view: RefObject<EditorView | null>,
  { source, relativePath, code, layout }: EditorExtensionsOptions,
): EditorExtensions {
  // Calls the same hooks whatever the source, so that a change of source keeps their order.
  const editorManager = useEditorManager();
  const commands = useCommandManager();
  const bindings = useCommandManager((commands) => commands.keymap.keys.editor);
  const keys = useMemo(() => editorKeymap(commands, bindings), [commands, bindings]);
  const theme = useThemeExtension();
  const { name, language } = useLanguage(relativePath);
  const support = useMemo<Extension>(() => language?.support ?? [], [language]);
  const languageServer = useLanguageServerExtension(
    source.type === 'workingTree' ? source.root : undefined, // Blobs do not have LSP server support.
    name,
    relativePath,
  );
  const folding = useMemo<Extension>(() => (layout.type === 'split' ? [] : foldMarkers()), [layout.type]);
  const settings = useSettingsExtension(name);
  const { search, portal: searchPortal } = useSearchExtension();
  const { toolbar, portal: toolbarPortal } = useToolbarExtension();

  // Defaults to the line separator the content already uses, or the platform's if it has none.
  const lineSeparator: LineSeparator =
    useEditorSettings(name, 'lineSeparator') ??
    (code.includes('\r\n') || (!code.includes('\n') && PLATFORM === 'windows') ? '\r\n' : '\n');

  const document = useMemo<EditorDocument | null>(
    () => (language === null ? null : { relativePath, layout, language }),
    [relativePath, layout, language],
  );
  const documentExtension = useMemo<Extension>(
    () => (document === null ? [] : EDITOR_DOCUMENT.of(document)),
    [document],
  );

  useCompartment(view, KEYS, keys);
  useCompartment(view, THEME, theme);
  useCompartment(view, FOLDING, folding);
  useCompartment(view, SETTINGS, settings);
  useCompartment(view, LANGUAGE, support);
  useCompartment(view, LANGUAGE_SERVER, languageServer);
  // Has to come before the plugins, so that their extensions are built with the document.
  useCompartment(view, DOCUMENT, documentExtension);

  const plugins = usePlugins(view, document);

  useFontRebuild(view);

  return {
    document,
    core:
      source.type === 'workingTree'
        ? [
            // First to let plugins' themes and keymaps take precedence. Plugins are applied by the caller to prevent
            // broken plugins from causing the entire editor to fail.
            PLUGINS.of([]),
            DOCUMENT.of(documentExtension),
            // Has high precedence to let the commands' keys take precedence over the keymaps of plugins' extensions.
            KEYS.of(keys),
            COMMANDS.of(commands),
            EditorView.updateListener.of((update) => {
              if (update.focusChanged && update.view.hasFocus) {
                editorManager.activate(update.view);
              }
            }),
            THEME.of(theme),
            history(),
            search,

            SETTINGS.of(settings),
            toolbar,
            // This cannot be inside SETTINGS because changing the line separator requires the entire doc to be
            // reparsed. Has the precedence for the same reason as the settings' facets.
            Prec.highest(EditorState.lineSeparator.of(lineSeparator)),

            LANGUAGE.of(support),
            LANGUAGE_SERVER.of(languageServer),
            completion(),
            hover(),
            actions(),
            format,
            closeBrackets(),
            bracketMatching(),
            // Has to be after lineNumbers to ensure the fold icon is to the right of it.
            FOLDING.of(folding),

            EditorState.allowMultipleSelections.of(true),
            drawSelection(),
            crosshairCursor(),
            rectangularSelection(),

            drawActiveLine(),
            highlightActiveLineGutter(),
            selectionMatches(),
            highlightSpecialChars(),
            RIGHT_CLICK_CONTEXT_MENU,
            navigation(),
            scrollbarsKeepFocus(),

            // Escape is not a command to keep it from taking precedence over the popups' own Escape.
            keymap.of([...standardKeymap, { key: 'Escape', run: simplifySelection }]),
          ]
        : [
            // First and at the highest precedence to prevent plugins from accidentally overriding.
            Prec.highest(EditorState.readOnly.of(true)),
            // First to let plugins' themes and keymaps take precedence. Plugins are applied by the caller to prevent
            // broken plugins from causing the entire editor to fail.
            PLUGINS.of([]),
            DOCUMENT.of(documentExtension),
            // Has high precedence to let the commands' keys take precedence over the keymaps of plugins' extensions.
            KEYS.of(keys),
            COMMANDS.of(commands),
            EditorView.updateListener.of((update) => {
              if (update.focusChanged && update.view.hasFocus) {
                editorManager.activate(update.view);
              }
            }),
            THEME.of(theme),
            search,

            SETTINGS.of(settings),
            toolbar,
            // This cannot be inside SETTINGS because changing the line separator requires the entire doc to be
            // reparsed. Has the precedence for the same reason as the settings' facets.
            Prec.highest(EditorState.lineSeparator.of(lineSeparator)),

            LANGUAGE.of(support),
            hover(),
            bracketMatching(),
            // Has to be after lineNumbers to ensure the fold icon is to the right of it.
            FOLDING.of(folding),

            EditorState.allowMultipleSelections.of(true),
            drawSelection(),
            crosshairCursor(),
            rectangularSelection(),

            drawActiveLine(),
            highlightActiveLineGutter(),
            selectionMatches(),
            highlightSpecialChars(),
            RIGHT_CLICK_CONTEXT_MENU,
            navigation(),
            scrollbarsKeepFocus(),

            // Escape is not a command to keep it from taking precedence over the popups' own Escape.
            keymap.of([...standardKeymap, { key: 'Escape', run: simplifySelection }]),
          ],
    portal: (
      <>
        {searchPortal}
        {toolbarPortal}
      </>
    ),
    lineSeparator,
    plugins,
  };
}

export function useLanguage(path: string): {
  name: string | undefined;
  language: LanguageDescription | undefined | null;
} {
  const languages = useEditorManager((editor) => editor.languages.languages);
  const description = LanguageDescription.matchFilename(languages, path);
  // The description whose support finished loading, or failed to.
  const [settled, setSettled] = useState<LanguageDescription | null>(null);

  useEffect(() => {
    if (description === null || description.support !== undefined) {
      return;
    }

    // Keeps a grammar that loads late from settling another file's language.
    let live = true;
    description.load().then(
      () => {
        if (live) {
          setSettled(description);
        }
      },
      (error) => {
        console.error(`Language ${description.name} failed to load`, error);
        if (live) {
          setSettled(description);
        }
      },
    );

    return () => {
      live = false;
    };
  }, [description]);

  return {
    name: description?.name,
    language:
      description === null
        ? undefined
        : description.support !== undefined
          ? description
          : description === settled
            ? undefined
            : null,
  };
}

/**
 * Returns the plugins' extensions for `document`, and applies them to `view` when they change.
 *
 * Leaves out those from functions while the document's language loads (null), so that they see its `support`.
 */
export function usePlugins(view: RefObject<EditorView | null>, document: EditorDocument | null): Extension {
  const extensions = useEditorManager((editor) => editor.extensions);
  const plugins = useMemo(() => {
    try {
      return extensions.flatMap((extension) =>
        typeof extension === 'function' ? (document === null ? [] : extension(document)) : extension,
      );
    } catch (error) {
      console.error('Plugin extension failed', error);
      return [];
    }
  }, [extensions, document]);

  useEffect(() => {
    if (view.current !== null) {
      applyPlugins(view.current, plugins);
    }
  }, [view, plugins]);

  return plugins;
}

export function applyPlugins(view: EditorView, plugins: Extension): void {
  try {
    view.dispatch({ effects: PLUGINS.reconfigure(plugins) });
  } catch (error) {
    console.error('Plugin extension failed', error);
    view.dispatch({ effects: PLUGINS.reconfigure([]) });
  }
}

export function useCompartment(view: RefObject<EditorView | null>, compartment: Compartment, value: Extension): void {
  useEffect(() => {
    view.current?.dispatch({ effects: compartment.reconfigure(value) });
  }, [view, compartment, value]);
}

// Rebuilds `view` when the editor's font changes. CodeMirror caches measurements such as the character width, and
// does not notice a font that changes through a CSS variable.
function useFontRebuild(view: RefObject<EditorView | null>): void {
  const font = useSettings((settings) => settings.appearance.editor.font);
  const previous = useRef(font);

  useEffect(() => {
    const editor = view.current;
    if (editor === null || previous.current === font) {
      return;
    }

    previous.current = font;
    const top = editor.lineBlockAtHeight(editor.scrollDOM.scrollTop).from;

    editor.setState(editor.state);
    editor.dispatch({ effects: EditorView.scrollIntoView(top, { y: 'start' }) });
  }, [view, font]);
}

function foldMarkers(): Extension {
  return foldGutter({
    markerDOM: (open) => {
      const marker = document.createElement('span');
      marker.className = 'cm-fold-marker';
      if (open) {
        marker.dataset.open = '';
      }
      return marker;
    },
  });
}
