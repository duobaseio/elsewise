import { getIndentUnit, indentUnit } from '@codemirror/language';
import type { EditorFormatter } from '@elsewise/plugin';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import * as typescript from 'prettier/plugins/typescript';
import { format } from 'prettier/standalone';

/**
 * Prettier as a formatter, by the CodeMirror name of each language it formats.
 */
export const PRETTIER: Record<string, EditorFormatter> = {
  TypeScript: formatter('typescript'),
  TSX: formatter('typescript'),
  JavaScript: formatter('babel'),
  JSX: formatter('babel'),
};

// Returns a formatter that runs Prettier's `parser`, before the language server.
function formatter(parser: 'typescript' | 'babel'): EditorFormatter {
  return {
    order: 10,
    async format(view, ranges) {
      const source = view.state.doc.toString();
      // Prettier returns the whole document with only the range formatted, and the editor applies only the parts that
      // differ.
      const formatted = await Promise.all(
        (ranges ?? [undefined]).map((range) =>
          format(source, {
            parser,
            plugins: [estree, babel, typescript],
            tabWidth: getIndentUnit(view.state),
            useTabs: view.state.facet(indentUnit).includes('\t'),
            rangeStart: range?.from,
            rangeEnd: range?.to,
          }),
        ),
      );
      return formatted.map((text) => ({ from: 0, to: source.length, insert: text }));
    },
  };
}
