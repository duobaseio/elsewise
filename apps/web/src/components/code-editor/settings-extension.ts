import { indentUnit } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useMemo } from 'react';
import { visualGuides } from '@/components/code-editor/visual-guides';
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

  return useMemo(
    () => [
      EditorState.tabSize.of(tabSize),
      indentUnit.of(indent),
      showLineNumbers ? lineNumbers() : [],
      lineWrapping ? EditorView.lineWrapping : [],
      visualGuides(guides),
    ],
    [tabSize, indent, showLineNumbers, lineWrapping, guides],
  );
}
