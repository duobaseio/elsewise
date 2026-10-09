import { getIndentUnit, indentUnit } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { type EditorView, keymap } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import type { DocumentFormattingParams, DocumentRangeFormattingParams, TextEdit } from 'vscode-languageserver-protocol';

/**
 * The key that formats the selection, or the document without one.
 */
export const FORMAT = 'Mod-Alt-l';

/**
 * Returns the extension that formats the selection, or the document without one, on Mod-Alt-L.
 *
 * It replaces `@codemirror/lsp-client`'s `formatKeymap`, which reports errors in a bar, and binds Shift-Alt-F, which
 * macOS types as `Ï`.
 */
export function serverFormatting(): LSPClientExtension {
  return { editorExtension: keymap.of([{ key: FORMAT, run: format, preventDefault: true }]) };
}

// Copied from `@codemirror/lsp-client`'s `formatDocument`.
//
// Formats only the selection, with `textDocument/rangeFormatting`, when there is one. Leaves the key to the editor
// when it is read-only or the server can't format what would be formatted, and reports errors in a toast.
export function format(view: EditorView): boolean {
  const plugin = LSPPlugin.get(view);
  const capabilities = plugin?.client.serverCapabilities;
  const ranges = view.state.selection.ranges.filter((range) => !range.empty);
  const selection = ranges.length > 0;
  const supported = selection
    ? capabilities?.documentRangeFormattingProvider
    : capabilities?.documentFormattingProvider;
  if (!plugin || view.state.readOnly || !supported) {
    return false;
  }

  const options = {
    tabSize: getIndentUnit(view.state),
    insertSpaces: !view.state.facet(indentUnit).includes('\t'),
  };
  const textDocument = { uri: plugin.uri };
  plugin.client.sync();
  plugin.client.withMapping(async (mapping) => {
    try {
      const responses = await Promise.all(
        selection
          ? ranges.map((range) =>
              plugin.client.request<DocumentRangeFormattingParams, TextEdit[] | null>('textDocument/rangeFormatting', {
                options,
                range: { start: plugin.toPosition(range.from), end: plugin.toPosition(range.to) },
                textDocument,
              }),
            )
          : [
              plugin.client.request<DocumentFormattingParams, TextEdit[] | null>('textDocument/formatting', {
                options,
                textDocument,
              }),
            ],
      );

      const changed = mapping.getMapping(plugin.uri);
      const changes: { from: number; to: number; insert: string }[] = [];
      for (const change of responses.flatMap((response) => response ?? [])) {
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

      // Drops a change that overlaps or repeats an earlier one, since two selections' answers can both change the lines
      // between them.
      const kept: typeof changes = [];
      for (const change of changes.sort((a, b) => a.from - b.from || a.to - b.to)) {
        const last = kept.at(-1);
        if (!last || change.from > last.to || (change.from === last.to && change.from !== last.from)) {
          kept.push(change);
        }
      }
      view.dispatch({ changes: kept, userEvent: 'format' });
    } catch (error) {
      toast.add({ type: 'error', title: 'Formatting request failed', description: (error as Error).message });
    }
  });
  return true;
}
