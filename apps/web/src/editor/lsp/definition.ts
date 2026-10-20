import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import {
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  DEFAULT_NAVIGATION_SOURCES,
  type EditorCommand,
  type EditorNavigation,
  type EditorNavigationSource,
} from '@elsewise/plugin';
import type { DefinitionParams, Location, LocationLink } from 'vscode-languageserver-protocol';
import { COMMANDS } from '@/editor/editor-manager';
import { navigable } from '@/editor/lsp/symbol';
import { scroll } from '@/editor/scroll';

/**
 * Returns the client extension that navigates from a symbol to its definition.
 */
export function serverDefinition(): LSPClientExtension {
  return {
    clientCapabilities: { textDocument: { definition: { linkSupport: true } } },
    editorExtension: EditorState.languageData.of(() => [{ navigation: SERVER }]),
  };
}

const SERVER: EditorNavigationSource = {
  order: DEFAULT_NAVIGATION_SOURCES.lsp,
  navigation: (view, pos, side) => definition(view, side < 0 ? pos - 1 : pos),
};

/**
 * Replaces `@codemirror/lsp-client`'s `jumpToDefinitionKeymap`.
 */
export const GO_TO_DEFINITION: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.lsp.goToDefinition,
  label: 'Go to definition',
  defaultKeys: DEFAULT_KEYS.editor.lsp.goToDefinition,
  enabled: (_, _view, lsp) => Boolean(lsp?.client.serverCapabilities?.definitionProvider),
  shown: (_, view, lsp) => Boolean(lsp?.client.serverCapabilities?.definitionProvider) && navigable(view.state),
  run(_, view, lsp) {
    if (lsp === null) {
      return false;
    }

    const { doc } = view.state;
    definition(view, view.state.selection.main.head)
      // Gives up when the document changed while the server was asked, since the position no longer fits it.
      .then((navigation) => (navigation !== null && view.state.doc === doc ? navigation.navigate(view) : undefined))
      .catch((error: unknown) => {
        toast.add({ type: 'error', title: 'Go to definition failed', description: (error as Error).message });
      });
    return true;
  },
};

/**
 * Returns the navigation from the word at `pos` to its definition, or null if the word can't be followed/server finds
 * nothing.
 *
 * The definition itself finds its usages instead.
 */
async function definition(view: EditorView, pos: number): Promise<EditorNavigation | null> {
  const lsp = LSPPlugin.get(view);
  const word =
    lsp?.client.serverCapabilities?.definitionProvider && navigable(view.state, pos) ? view.state.wordAt(pos) : null;
  if (lsp === null || word === null) {
    return null;
  }

  lsp.client.sync();
  const { doc } = view.state;
  // Based on `@codemirror/lsp-client`'s `jumpToOrigin`.
  const response = await lsp.client.request<DefinitionParams, Location | Location[] | LocationLink[] | null>(
    'textDocument/definition',
    { textDocument: { uri: lsp.uri }, position: lsp.toPosition(pos, doc) },
  );
  const first = Array.isArray(response) ? response[0] : response;
  if (!first) {
    return null;
  }

  const target =
    'targetUri' in first ? { uri: first.targetUri, range: first.targetSelectionRange } : (first as Location);
  const origin = 'originSelectionRange' in first && first.originSelectionRange ? first.originSelectionRange : null;
  const from = origin === null ? word.from : lsp.fromPosition(origin.start, doc);
  const to = origin === null ? word.to : lsp.fromPosition(origin.end, doc);
  if (
    target.uri === lsp.uri &&
    lsp.fromPosition(target.range.start, doc) < to &&
    from < lsp.fromPosition(target.range.end, doc)
  ) {
    return {
      from,
      to,
      navigate(view) {
        view.dispatch({ selection: { anchor: from } });
        view.focus();
        view.state.facet(COMMANDS)?.run(DEFAULT_COMMANDS.editor.lsp.findUsages, view);
      },
    };
  }

  return {
    from,
    to,
    async navigate(view) {
      const editor = target.uri === lsp.uri ? view : await lsp.client.workspace.displayFile(target.uri);
      if (!editor) {
        return;
      }

      const pos = lsp.fromPosition(target.range.start, editor.state.doc);
      editor.dispatch({
        selection: { anchor: pos },
        effects: scroll(EditorSelection.cursor(pos), editor),
        userEvent: 'select.definition',
      });
      editor.focus();
    },
  };
}
