import type { Completion } from '@codemirror/autocomplete';
import type { LanguageDescription } from '@codemirror/language';
import type { Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Tag } from '@lezer/highlight';
import type { Diagnostic as LSPDiagnostic } from 'vscode-languageserver-protocol';
import type { Disposable } from '../plugin.ts';
import type { LanguageServer } from './lsp.ts';

/**
 * The code editor.
 */
export interface Editor {
  /**
   * The open editor that is or was last focused.
   *
   * `null` when:
   * * no editor has focused yet.
   * * the active editor is closed and focus has not shifted to another open editor.
   *
   * The active editor remains the same when focus is elsewhere (except on another editor), e.g. in a menu.
   */
  readonly active: EditorView | null;

  /**
   * Adds `extensions` to the editor, each an extension or a function that returns one for each document.
   *
   * Returns a disposable that removes the `extensions`.
   */
  addExtensions(extensions: readonly (Extension | ((document: EditorDocument) => Extension))[]): Disposable;

  /**
   * Adds `languages`, which take precedence over the built-in languages for the same files.
   *
   * Returns a disposable that removes the `languages`.
   */
  addLanguages(languages: readonly LanguageDescription[]): Disposable;

  /**
   * Adds language servers, which take precedence over the servers added earlier for the same languages.
   *
   * Returns a disposable that removes the `servers`.
   */
  addLanguageServers(servers: readonly LanguageServer[]): Disposable;
}

/**
 * A document open in the editor.
 */
export interface EditorDocument {
  /**
   * The document's path.
   */
  readonly path: string;
}

/**
 * A completion with what the editor shows beyond CodeMirror's {@link Completion}.
 *
 * To add completions:
 * ```ts
 * function source(context: CompletionContext): CompletionResult | null {
 *   const word = context.matchBefore(/\w+/);
 *   if (word === null) {
 *     return null;
 *   }
 *   const options: EditorCompletion[] = [{ label: 'parse', tail: '(text: string)', deprecated: true }];
 *   return { from: word.from, options };
 * }
 *
 * editor.addExtensions([EditorState.languageData.of(() => [{ autocomplete: source }])]);
 * ```
 *
 * The function passed to `languageData.of` must return the same `autocomplete` value on every call. CodeMirror tells
 * sources apart by identity, so a new value is a new source, queried again on every transaction.
 *
 * Good:
 * ```ts
 * EditorState.languageData.of(() => [{ autocomplete: source }]);
 * ```
 *
 * Bad:
 * ```ts
 * EditorState.languageData.of(() => [{ autocomplete: (context) => source(context) }]); // A new function.
 * EditorState.languageData.of(() => [{ autocomplete: [{ label: 'parse' }] }]); // A new array.
 * ```
 */
export interface EditorCompletion extends Completion {
  /**
   * The icon shown before the label. Defaults to an icon derived from {@link Completion.type}.
   */
  icon?: EditorCompletionIcon;

  /**
   * Whether the completion is deprecated.
   */
  deprecated?: boolean;

  /**
   * The text shown right after the label, such as the parameters or where an import comes from.
   */
  tail?: string;
}

/**
 * A completion's icon:
 * * `letters`: an icon of up to two letters in the tag's color.
 * * `svg`: the URL of an SVG, drawn in the tag's color.
 * * `image`: the URL of an image, drawn as it is.
 */
export type EditorCompletionIcon = { letters: string; tag?: Tag } | { svg: string; tag?: Tag } | { image: string };

/**
 * A diagnostic with what the editor shows beyond CodeMirror's {@link Diagnostic}.
 *
 * To add diagnostics:
 * ```ts
 * function lint(view: EditorView): EditorDiagnostic[] {
 *   const at = view.state.doc.toString().indexOf('var ');
 *   if (at < 0) {
 *     return [];
 *   }
 *   return [{
 *     from: at,
 *     to: at + 3,
 *     severity: 'warning',
 *     message: 'Use `let` instead of `var`',
 *     source: 'eslint',
 *     code: 'no-var',
 *     codeHref: 'https://eslint.org/docs/latest/rules/no-var',
 *   }];
 * }
 *
 * editor.addExtensions([linter(lint)]);
 * ```
 *
 * The editor shows a diagnostic's message with the parts quoted in backticks as code, unless it has
 * {@link Diagnostic.renderMessage}.
 */
export interface EditorDiagnostic extends Diagnostic {
  /**
   * The language server's diagnostic, which is sent back to the server when asking for code actions.
   */
  lsp?: LSPDiagnostic;

  /**
   * The diagnostic's code, e.g. `no-var`, shown after its source.
   */
  code?: string | number;

  /**
   * The URL of a description of the code, which the code links to. Only `http` and `https` URLs are linked.
   */
  codeHref?: string;
}
