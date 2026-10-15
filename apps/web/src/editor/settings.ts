import { indentUnit } from '@codemirror/language';
import { EditorState, type Extension, Prec } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useMemo } from 'react';
import { completionDocumentation } from '@/editor/lsp/completion';
import { highlightUsages } from '@/editor/lsp/highlights';
import { visualGuides } from '@/editor/visual-guides';
import { useEditorSettings, useSettings } from '@/settings/settings';

/**
 * Returns the CodeMirror extension that applies the editor's settings, with `language`'s overrides.
 *
 * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
 */
export function useSettingsExtension(language: string | undefined): Extension {
  const tabSize = useEditorSettings(language, 'tabSize');
  const indent = useEditorSettings(language, 'indentUnit');
  const showLineNumbers = useSettings((settings) => settings.appearance.editor.lineNumbers);
  const lineWrapping = useSettings((settings) => settings.appearance.editor.lineWrapping);
  const guides = useEditorSettings(language, 'visualGuides');
  const documentation = useSettings((settings) => settings.appearance.editor.completionDocumentation);
  const usages = useSettings((settings) => settings.appearance.editor.highlightUsages);

  return useMemo(
    () => [
      // The plugins' extensions come first in the editor's configuration, and these facets take their first value, so
      // the settings need the precedence to beat a plugin's.
      Prec.highest(EditorState.tabSize.of(tabSize)),
      Prec.highest(indentUnit.of(indent)),
      showLineNumbers ? lineNumbers() : [],
      lineWrapping ? EditorView.lineWrapping : [],
      visualGuides(guides),
      completionDocumentation.of(documentation),
      highlightUsages.of(usages),
    ],
    [tabSize, indent, showLineNumbers, lineWrapping, guides, documentation, usages],
  );
}
