import { getIndentUnit, indentUnit } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { EditorState } from '@codemirror/state';
import { DEFAULT_FORMATTERS, type EditorFormatter } from '@elsewise/plugin';
import type { DocumentFormattingParams, DocumentRangeFormattingParams, TextEdit } from 'vscode-languageserver-protocol';

/**
 * Returns the client extension that adds the server as a document formatter.
 */
export function serverFormat(): LSPClientExtension {
  return { editorExtension: EditorState.languageData.of(() => [{ formatter: SERVER }]) };
}

// Formats with `textDocument/formatting`, or `textDocument/rangeFormatting` for each selection, or for the whole
// document when that is all the server offers.
const SERVER: EditorFormatter = {
  order: DEFAULT_FORMATTERS.lsp,
  enabled(view, ranges) {
    const capabilities = LSPPlugin.get(view)?.client.serverCapabilities;
    return Boolean(
      ranges
        ? capabilities?.documentRangeFormattingProvider
        : capabilities?.documentFormattingProvider || capabilities?.documentRangeFormattingProvider,
    );
  },
  async format(view, ranges) {
    const lsp = LSPPlugin.get(view);
    if (lsp === null) {
      return [];
    }

    const { doc } = view.state;
    const options = {
      tabSize: getIndentUnit(view.state),
      insertSpaces: !view.state.facet(indentUnit).includes('\t'),
    };
    const textDocument = { uri: lsp.uri };
    lsp.client.sync();
    const responses =
      ranges === undefined && lsp.client.serverCapabilities?.documentFormattingProvider
        ? [
            await lsp.client.request<DocumentFormattingParams, TextEdit[] | null>('textDocument/formatting', {
              options,
              textDocument,
            }),
          ]
        : await Promise.all(
            (ranges ?? [{ from: 0, to: doc.length }]).map((range) =>
              lsp.client.request<DocumentRangeFormattingParams, TextEdit[] | null>('textDocument/rangeFormatting', {
                options,
                range: { start: lsp.toPosition(range.from, doc), end: lsp.toPosition(range.to, doc) },
                textDocument,
              }),
            ),
          );

    return responses
      .flatMap((response) => response ?? [])
      .map(({ range, newText }) => ({
        from: lsp.fromPosition(range.start, doc),
        to: lsp.fromPosition(range.end, doc),
        insert: newText,
      }));
  },
};
