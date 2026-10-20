import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { EditorState, type Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { DEFAULT_ACTION_SOURCES, type EditorActionSource } from '@elsewise/plugin';
import {
  type CodeAction,
  type CodeActionParams,
  CodeActionTriggerKind,
  type Command,
} from 'vscode-languageserver-protocol';
import { applyWorkspaceEdit } from '@/editor/lsp/edits';
import { run } from '@/editor/lsp/language-servers';

/**
 * Returns the client extension that adds the server's code actions to the actions.
 */
export function serverActions(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        codeAction: {
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: [
                'quickfix',
                'refactor',
                'refactor.extract',
                'refactor.inline',
                'refactor.rewrite',
                'source',
                'source.organizeImports',
                'source.fixAll',
              ],
            },
          },
          isPreferredSupport: true,
          dataSupport: true,
          resolveSupport: { properties: ['edit'] },
        },
      },
    },
    editorExtension: EditorState.languageData.of(() => [{ actions: SERVER }]),
  };
}

// Asks for `textDocument/codeAction` with the diagnostics the server found.
const SERVER: EditorActionSource = {
  order: DEFAULT_ACTION_SOURCES.lsp,
  async actions(view, from, to, diagnostics) {
    const plugin = LSPPlugin.get(view);
    if (!plugin?.client.serverCapabilities?.codeActionProvider) {
      return [];
    }

    plugin.client.sync();
    const doc = view.state.doc;
    const response = await plugin.client.request<CodeActionParams, (Command | CodeAction)[] | null>(
      'textDocument/codeAction',
      {
        textDocument: { uri: plugin.uri },
        range: { start: plugin.toPosition(from, doc), end: plugin.toPosition(to, doc) },
        context: {
          diagnostics: diagnostics.flatMap((diagnostic) => (diagnostic.lsp ? [diagnostic.lsp] : [])),
          triggerKind: CodeActionTriggerKind.Invoked,
        },
      },
    );

    return (
      (response ?? [])
        // Wraps a bare command in an action.
        .map(
          (item): CodeAction =>
            typeof item.command === 'string' ? { title: item.title, command: item as Command } : (item as CodeAction),
        )
        .filter((action) => !action.disabled)
        .map((action) => ({
          label: action.title,
          type:
            action.kind === 'quickfix' || action.kind?.startsWith('quickfix.')
              ? action.isPreferred
                ? ('preferredFix' as const)
                : ('fix' as const)
              : undefined,
          apply: (view: EditorView) => apply(view, action, doc),
        }))
    );
  },
};

/**
 * Applies `action`'s edits and runs its command.
 *
 * Does nothing if the document has changed since `doc`.
 */
async function apply(view: EditorView, action: CodeAction, doc: Text): Promise<void> {
  const plugin = LSPPlugin.get(view);
  if (!plugin || view.state.doc !== doc) {
    return;
  }

  // DO NOT REORDER.
  let resolved = action;
  const provider = plugin.client.serverCapabilities?.codeActionProvider;
  if (!action.edit && action.data !== undefined && typeof provider === 'object' && provider.resolveProvider) {
    resolved = await plugin.client.request<CodeAction, CodeAction>('codeAction/resolve', action);
    if (view.state.doc !== doc) {
      return;
    }
  }

  if (resolved.edit) {
    const { applied, failureReason } = applyWorkspaceEdit(plugin.client, resolved.edit);
    if (!applied) {
      throw new Error(failureReason ?? "The edit didn't apply.");
    }
  }

  if (resolved.command) {
    await run(view, plugin, resolved.command);
  }
  // DO NOT REORDER.
}
