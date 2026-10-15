import { getIndentUnit, indentUnit } from '@codemirror/language';
import { toast } from '@elsewise/components/components/toast';
import { DEFAULT_COMMANDS, DEFAULT_KEYS, type EditorCommand } from '@elsewise/plugin';
import type { DocumentFormattingParams, DocumentRangeFormattingParams, TextEdit } from 'vscode-languageserver-protocol';

/**
 * Replaces `@codemirror/lsp-client`'s `formatKeymap`, which reports errors in a bar, and binds Shift-Alt-F, which
 * macOS types as `Ï`.
 */
export const FORMAT: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.lsp.format,
  label: 'Format',
  defaultKeys: DEFAULT_KEYS.editor.lsp.format,
  // Copied from `@codemirror/lsp-client`'s `formatDocument`.
  //
  // Formats only the selection, with `textDocument/rangeFormatting`, when there is one. Leaves the key to the editor
  // when it is read-only or the lsp can't format what would be formatted, and reports errors in a toast.
  enabled(_, view, lsp) {
    const capabilities = lsp?.client.serverCapabilities;
    const selection = view.state.selection.ranges.some((range) => !range.empty);
    return (
      !view.state.readOnly &&
      Boolean(selection ? capabilities?.documentRangeFormattingProvider : capabilities?.documentFormattingProvider)
    );
  },
  shown(_, _view, lsp) {
    const capabilities = lsp?.client.serverCapabilities;
    return Boolean(capabilities?.documentFormattingProvider || capabilities?.documentRangeFormattingProvider);
  },
  run(_, view, lsp) {
    if (lsp === null) {
      return false;
    }

    const ranges = view.state.selection.ranges.filter((range) => !range.empty);
    const selection = ranges.length > 0;
    const options = {
      tabSize: getIndentUnit(view.state),
      insertSpaces: !view.state.facet(indentUnit).includes('\t'),
    };
    const textDocument = { uri: lsp.uri };
    lsp.client.sync();
    lsp.client.withMapping(async (mapping) => {
      try {
        const responses = await Promise.all(
          selection
            ? ranges.map((range) =>
                lsp.client.request<DocumentRangeFormattingParams, TextEdit[] | null>('textDocument/rangeFormatting', {
                  options,
                  range: { start: lsp.toPosition(range.from), end: lsp.toPosition(range.to) },
                  textDocument,
                }),
              )
            : [
                lsp.client.request<DocumentFormattingParams, TextEdit[] | null>('textDocument/formatting', {
                  options,
                  textDocument,
                }),
              ],
        );

        const changed = mapping.getMapping(lsp.uri);
        const changes: { from: number; to: number; insert: string }[] = [];
        for (const change of responses.flatMap((response) => response ?? [])) {
          let from = mapping.mapPosition(lsp.uri, change.range.start);
          let to = mapping.mapPosition(lsp.uri, change.range.end);
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

        // Drops a change that overlaps or repeats an earlier one, since two selections' answers can both change the
        // lines between them.
        const kept: typeof changes = [];
        for (const change of changes.sort((a, b) => a.from - b.from || a.to - b.to)) {
          const last = kept.at(-1);
          if (!last || change.from > last.to || (change.from === last.to && change.from !== last.from)) {
            kept.push(change);
          }
        }
        view.dispatch({ changes: kept, userEvent: 'format' });
      } catch (error) {
        toast.add({ type: 'error', title: 'Formatting failed', description: (error as Error).message });
      }
    });
    return true;
  },
};
