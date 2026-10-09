import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { EditorSelection } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import type { DefinitionParams, Location } from 'vscode-languageserver-protocol';
import { scroll } from '@/components/code-editor/scroll';

/**
 * Returns the extension that jumps to the definition of the symbol at the cursor.
 *
 * It replaces `@codemirror/lsp-client`'s `jumpToDefinitionKeymap`, which scrolls the definition just into view.
 */
export function serverDefinition(): LSPClientExtension {
  return { editorExtension: keymap.of([{ key: 'F12', run: jumpToDefinition, preventDefault: true }]) };
}

// Copied from `@codemirror/lsp-client`'s `jumpToOrigin`.
//
// Scrolls the definition to the middle of the editor unless it is visible already, as search does, and reports errors in a
// toast.
function jumpToDefinition(view: EditorView): boolean {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.serverCapabilities?.definitionProvider) {
    return false;
  }

  plugin.client.sync();
  plugin.client.withMapping(async (mapping) => {
    try {
      const response = await plugin.client.request<DefinitionParams, Location | Location[] | null>(
        'textDocument/definition',
        { textDocument: { uri: plugin.uri }, position: plugin.toPosition(view.state.selection.main.head) },
      );
      const location = Array.isArray(response) ? response[0] : response;
      if (!location) {
        return;
      }

      const target = location.uri === plugin.uri ? view : await plugin.client.workspace.displayFile(location.uri);
      if (!target) {
        return;
      }

      const pos = mapping.getMapping(location.uri)
        ? mapping.mapPosition(location.uri, location.range.start)
        : plugin.fromPosition(location.range.start, target.state.doc);
      target.dispatch({
        selection: { anchor: pos },
        effects: scroll(EditorSelection.cursor(pos), target),
        userEvent: 'select.definition',
      });
    } catch (error) {
      toast.add({ type: 'error', title: 'Find definition failed', description: (error as Error).message });
    }
  });
  return true;
}
