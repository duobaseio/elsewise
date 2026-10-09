import { getIndentUnit, indentUnit } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { type EditorView, keymap } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import type { DocumentFormattingParams, TextEdit } from 'vscode-languageserver-protocol';

/**
 * Returns the extension that formats the document on Mod-Alt-L.
 *
 * It replaces `@codemirror/lsp-client`'s `formatKeymap`, which reports errors in a bar, and binds Shift-Alt-F, which
 * macOS types as `Ï`.
 */
export function serverFormatting(): LSPClientExtension {
  return { editorExtension: keymap.of([{ key: 'Mod-Alt-l', run: format, preventDefault: true }]) };
}

// Copied from `@codemirror/lsp-client`'s `formatDocument`.
//
// Leaves the key to the editor when the server can't format, and reports errors in a toast.
function format(view: EditorView): boolean {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.serverCapabilities?.documentFormattingProvider) {
    return false;
  }

  plugin.client.sync();
  plugin.client.withMapping(async (mapping) => {
    try {
      const response = await plugin.client.request<DocumentFormattingParams, TextEdit[] | null>(
        'textDocument/formatting',
        {
          options: {
            tabSize: getIndentUnit(view.state),
            insertSpaces: !view.state.facet(indentUnit).includes('\t'),
          },
          textDocument: { uri: plugin.uri },
        },
      );
      if (!response) {
        return;
      }

      const changed = mapping.getMapping(plugin.uri);
      const changes: { from: number; to: number; insert: string }[] = [];
      for (const change of response) {
        let from = mapping.mapPosition(plugin.uri, change.range.start);
        let to = mapping.mapPosition(plugin.uri, change.range.end);
        if (changed) {
          // Doesn't apply the changes if code inside any of them was touched.
          if (changed.touchesRange(from, to)) {
            return;
          }
          from = changed.mapPos(from, 1);
          to = changed.mapPos(to, -1);
        }
        changes.push({ from, to, insert: change.newText });
      }
      view.dispatch({ changes, userEvent: 'format' });
    } catch (error) {
      toast.add({ type: 'error', title: 'Formatting request failed', description: (error as Error).message });
    }
  });
  return true;
}
