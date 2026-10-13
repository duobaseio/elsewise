import { EditorSelection } from '@codemirror/state';
import { toast } from '@elsewise/components/components/toast';
import { DEFAULT_COMMANDS, type EditorCommand } from '@elsewise/plugin';
import type { DefinitionParams, Location } from 'vscode-languageserver-protocol';
import { scroll } from '@/components/code-editor/scroll';
import { navigable } from '@/editor/lsp/symbol';

/**
 * Replaces `@codemirror/lsp-client`'s `jumpToDefinitionKeymap`.
 */
export const GO_TO_DEFINITION: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.lsp.goToDefinition,
  label: 'Go to definition',
  defaultKeys: ['Mod-b'],
  enabled: (_, _view, lsp) => Boolean(lsp?.client.serverCapabilities?.definitionProvider),
  shown: (_, view, lsp) => Boolean(lsp?.client.serverCapabilities?.definitionProvider) && navigable(view.state),
  // Copied from `@codemirror/lsp-client`'s `jumpToOrigin`.
  run(_, view, lsp) {
    if (lsp === null) {
      return;
    }

    lsp.client.sync();
    lsp.client.withMapping(async (mapping) => {
      try {
        const response = await lsp.client.request<DefinitionParams, Location | Location[] | null>(
          'textDocument/definition',
          { textDocument: { uri: lsp.uri }, position: lsp.toPosition(view.state.selection.main.head) },
        );
        const location = Array.isArray(response) ? response[0] : response;
        if (!location) {
          return;
        }

        const target = location.uri === lsp.uri ? view : await lsp.client.workspace.displayFile(location.uri);
        if (!target) {
          return;
        }

        const pos = mapping.getMapping(location.uri)
          ? mapping.mapPosition(location.uri, location.range.start)
          : lsp.fromPosition(location.range.start, target.state.doc);
        target.dispatch({
          selection: { anchor: pos },
          effects: scroll(EditorSelection.cursor(pos), target),
          userEvent: 'select.definition',
        });
      } catch (error) {
        toast.add({ type: 'error', title: 'Go to definition failed', description: (error as Error).message });
      }
    });
  },
};
