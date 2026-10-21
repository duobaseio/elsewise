import type { Completion } from '@codemirror/autocomplete';
import type { LanguageDescription } from '@codemirror/language';
import type { Action, Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { EditorView, HoverTooltipSource } from '@codemirror/view';
import type { Tag } from '@lezer/highlight';
import type { Diagnostic as LSPDiagnostic } from 'vscode-languageserver-protocol';
import type { ContextMenu } from '../context-menu.ts';
import type { Disposable } from '../plugin.ts';
import type { LanguageServer } from './lsp.ts';
import type { EditorToolbarItem } from './toolbar.ts';

/**
 * The orders of the built-in hover sections, shown lowest first.
 *
 * See {@link EditorHoverSource}.
 */
export const DEFAULT_HOVER_SECTIONS = {
  diagnostics: 10,
  documentation: 20,
} as const;

/**
 * The orders of the built-in formatters, tried lowest first.
 *
 * See {@link EditorFormatter}.
 */
export const DEFAULT_FORMATTERS = {
  lsp: 10,
} as const;

/**
 * The orders of the built-in action sources, shown lowest first.
 *
 * See {@link EditorActionSource}.
 */
export const DEFAULT_ACTION_SOURCES = {
  lsp: 10,
} as const;

/**
 * The orders of the built-in navigation sources, tried lowest first.
 *
 * See {@link EditorNavigationSource}.
 */
export const DEFAULT_NAVIGATION_SOURCES = {
  url: 10,
  lsp: 20,
} as const;

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
   * ```ts
   * editor.addExtensions([
   *   // In every document.
   *   EditorState.languageData.of(() => [{ autocomplete: reactions }]),
   *
   *   // In TypeScript documents only.
   *   ({ language }) =>
   *     language?.name === 'TypeScript' ? language.support.language.data.of({ autocomplete: imports }) : [],
   * ]);
   * ```
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

  /**
   * Adds `items` to the floating toolbar in the editor's top right corner.
   *
   * ```ts
   * editor.addToolbarItems([
   *   { type: 'command', order: 20, command: 'example.shrug', icon: ShrugIcon }, // Left of the diagnostics summary.
   *   { type: 'component', id: 'example.words', component: Words }, // On the left.
   * ]);
   * ```
   *
   * Returns a disposable that removes the `items`.
   */
  addToolbarItems(items: readonly EditorToolbarItem[]): Disposable;

  /**
   * Adds `menus` to the context menu.
   *
   * Returns a disposable that removes the `menus`.
   */
  addContextMenus(menus: readonly Partial<ContextMenu>[]): Disposable;
}

/**
 * A document open in the editor.
 */
export interface EditorDocument {
  /**
   * The document's path.
   */
  readonly path: string;

  /**
   * The document's language, with its `support` loaded, or undefined if none matches the path.
   */
  readonly language?: LanguageDescription;
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
 * editor.addExtensions([
 *   ({ language }) =>
 *     language?.name === 'TypeScript' ? language.support.language.data.of({ autocomplete: source }) : [],
 * ]);
 * ```
 *
 * To add completions in every language, use `EditorState.languageData.of`. The function passed to it must return the
 * same `autocomplete` value on every call. CodeMirror tells sources apart by identity, so a new value is a new source,
 * queried again on every transaction.
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
 * A source of a hover section, added as the `hover` language data.
 *
 * It should not perform expensive/high latency operations as the hover only opens once every source has completed.
 *
 * To add `EditorHoverSource`s:
 * ```ts
 * const BLAME: EditorHoverSource = { source: blame }; // Last.
 * const SUMMARY: EditorHoverSource = { source: summarize, order: 15 }; // Between diagnostics and documentation.
 *
 * editor.addExtensions([
 *   // In every document.
 *   EditorState.languageData.of(() => [{ hover: BLAME }]),
 *
 *   // In TypeScript documents only.
 *   ({ language }) => (language?.name === 'TypeScript' ? language.support.language.data.of({ hover: SUMMARY }) : []),
 * ]);
 * ```
 */
export interface EditorHoverSource {
  readonly source: HoverTooltipSource;

  /**
   * The order the section is shown in, lowest first.
   *
   * Sections without an order are shown last. Those with the same order are shown by source: plugins, then the
   * language, then the language server.
   *
   * See {@link DEFAULT_HOVER_SECTIONS}.
   */
  readonly order?: number;
}

/**
 * A document formatter, added as the `formatter` language data.
 *
 * The formatters are tried by `order`, and the first that is enabled formats the document or selection.
 *
 * ```ts
 * const TRIM: EditorFormatter = { format: trim }; // Last.
 * const PRETTIER: EditorFormatter = { order: 5, format: prettier }; // Before the language server.
 *
 * editor.addExtensions([
 *   // In every document.
 *   EditorState.languageData.of(() => [{ formatter: TRIM }]),
 *
 *   // In TypeScript documents only.
 *   ({ language }) =>
 *     language?.name === 'TypeScript' ? language.support.language.data.of({ formatter: PRETTIER }) : [],
 * ]);
 * ```
 */
export interface EditorFormatter {
  /**
   * The order the formatter is tried in, lowest first.
   *
   * Formatters without an order are tried last. Those with the same order are tried by source: plugins, then the
   * language, then the language server.
   *
   * See {@link DEFAULT_FORMATTERS}.
   */
  readonly order?: number;

  /**
   * Returns whether it can format the document, or only `ranges` of it if given. Defaults to true.
   */
  enabled?(view: EditorView, ranges?: readonly { from: number; to: number }[]): boolean;

  /**
   * Returns the changes that format the document, or only `ranges` of it if given.
   */
  format(
    view: EditorView,
    ranges?: readonly { from: number; to: number }[],
  ): Promise<readonly { from: number; to: number; insert: string }[]>;
}

/**
 * A source of context actions, added as the `actions` language data.
 *
 * Linters can also produce actions via {@link EditorDiagnostic.actions}. The actions are shown in groups. Within each
 * group, the diagnostic actions are first, then the actions from `EditorActionSource`s, ordered by
 * `EditorActionSource.order`, lowest first.
 * ```
 * ┌──────────────────────────────┐
 * │ Add import from "./util"     │  preferred fixes
 * ├──────────────────────────────┤
 * │ Remove unused `total`        │  fixes
 * │ Declare function `shout`     │
 * ├──────────────────────────────┤
 * │ Sort imports                 │  other actions
 * │ Organize imports             │
 * │ Explain `Cannot find shout`  │
 * └──────────────────────────────┘
 * ```
 *
 * To add `EditorActionSource`s:
 * ```ts
 * const EXPLAIN: EditorActionSource = {
 *   actions: async (view, from, to, diagnostics) =>
 *     diagnostics.map((diagnostic) => ({
 *       label: `Explain \`${diagnostic.message}\``,
 *       apply: () => explain(diagnostic),
 *     })),
 * }; // Last.
 * const IMPORTS: EditorActionSource = { order: 5, actions: imports }; // Before the language server.
 *
 * editor.addExtensions([
 *   // In every document.
 *   EditorState.languageData.of(() => [{ actions: EXPLAIN }]),
 *
 *   // In TypeScript documents only.
 *   ({ language }) => (language?.name === 'TypeScript' ? language.support.language.data.of({ actions: IMPORTS }) : []),
 * ]);
 * ```
 */
export interface EditorActionSource {
  /**
   * The order the source's actions are shown in, lowest first, within each group.
   *
   * Sources without an order are shown last. Those with the same order are shown by source: plugins, then the
   * language, then the language server.
   *
   * See {@link DEFAULT_ACTION_SOURCES}.
   */
  readonly order?: number;

  /**
   * Returns the actions.
   */
  actions(
    view: EditorView,
    from: number,
    to: number,
    diagnostics: readonly EditorDiagnostic[],
  ): Promise<readonly EditorAction[]>;
}

/**
 * An action on the code, such as a fix for a diagnostic.
 */
export interface EditorAction {
  /**
   * Whether it fixes a diagnostic, and is preferred over the other fixes. Defaults to neither.
   *
   * See {@link EditorActionSource} for how the actions are shown.
   */
  readonly type?: 'preferredFix' | 'fix';

  /**
   * The label shown, with the parts quoted in backticks as code.
   */
  readonly label: string;

  /**
   * Applies the action. The editor shows the error if it throws.
   */
  apply(view: EditorView): void | Promise<void>;
}

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

  /**
   * The actions shown with the context actions, and in the hover.
   */
  actions?: readonly EditorDiagnosticAction[];
}

/**
 * An action on a diagnostic, such as a fix for it.
 */
export interface EditorDiagnosticAction extends Action {
  /**
   * Whether it fixes the diagnostic, and is preferred over the other fixes. Defaults to neither.
   *
   * See {@link EditorActionSource} for how the actions are shown.
   */
  readonly type?: 'preferredFix' | 'fix';
}

/**
 * A source of navigation in the code, added as the `navigation` language data.
 *
 * Holding ⌘/Ctrl underlines the navigation under the pointer, and clicking it navigates. Every source at the position
 * is asked, and the navigation from the lowest `order` is used.
 *
 * To add `EditorNavigationSource`s:
 * ```ts
 * const ISSUES: EditorNavigationSource = { navigation: issue }; // Last.
 * const IMPORTS: EditorNavigationSource = { order: 15, navigation: imported }; // Between URLs and the language server.
 *
 * editor.addExtensions([
 *   // In every document.
 *   EditorState.languageData.of(() => [{ navigation: ISSUES }]),
 *
 *   // In TypeScript documents only.
 *   ({ language }) =>
 *     language?.name === 'TypeScript' ? language.support.language.data.of({ navigation: IMPORTS }) : [],
 * ]);
 * ```
 */
export interface EditorNavigationSource {
  /**
   * The order the source is tried in, lowest first.
   *
   * Sources without an order are tried last. Those with the same order are tried by source: plugins, then the
   * language, then the language server.
   *
   * See {@link DEFAULT_NAVIGATION_SOURCES}.
   */
  readonly order?: number;

  /**
   * Returns the navigation at `pos`, or null if there is none.
   *
   * `side` is -1 when the pointer is on the character before `pos`, and 1 when it is on the one at it.
   */
  navigation(view: EditorView, pos: number, side: -1 | 1): EditorNavigation | null | Promise<EditorNavigation | null>;
}

/**
 * A navigation from a range of the code, such as a URL or a symbol.
 */
export interface EditorNavigation {
  readonly from: number;
  readonly to: number;

  /**
   * Navigates. The editor shows the error if it throws.
   */
  navigate(view: EditorView): void | Promise<void>;
}
