import { getIndentUnit, indentUnit } from '@codemirror/language';
import { type Application, DEFAULT_COMMANDS, type LanguageServerTransport, type PluginContext } from '@elsewise/plugin';
import {
  CompletionItemKind,
  type ConfigurationParams,
  InsertTextFormat,
  type TextDocumentPositionParams,
} from 'vscode-languageserver-protocol';
import { PRETTIER } from './prettier.ts';

// Matches `scripts/serve.mjs`.
const SERVER = 'ws://127.0.0.1:7300';

/**
 * Called when Elsewise enables the plugin.
 */
export function enable({ editor, commands }: Application, { subscriptions }: PluginContext): void {
  subscriptions.push(
    // Formats the server's languages with Prettier rather than the server.
    editor.addExtensions([
      ({ language }) => {
        const formatter = language && PRETTIER[language.name];
        return formatter ? (language?.support?.language.data.of({ formatter }) ?? []) : [];
      },
    ]),
    editor.addLanguageServers([
      {
        id: 'typescript',
        name: 'TypeScript',
        languages: {
          TypeScript: 'typescript',
          TSX: 'typescriptreact',
          JavaScript: 'javascript',
          JSX: 'javascriptreact',
        },
        requestHandlers: {
          // Asked once per file for the indentation that refactors and fixes insert code with.
          'workspace/configuration': (client, { items }: ConfigurationParams) =>
            items.map(({ section, scopeUri }) => {
              const state = scopeUri === undefined ? undefined : client.workspace.getFile(scopeUri)?.getView()?.state;
              return section === 'formattingOptions' && state
                ? { tabSize: getIndentUnit(state), insertSpaces: !state.facet(indentUnit).includes('\t') }
                : null;
            }),
          // Sent after a refactor that makes up a name, e.g. extracting a constant, to rename it at once.
          '_typescript.rename': (client, { textDocument, position }: TextDocumentPositionParams) => {
            const view = client.workspace.getFile(textDocument.uri)?.getView();
            if (view) {
              view.dispatch({
                selection: { anchor: view.state.doc.line(position.line + 1).from + position.character },
              });
              commands.run(DEFAULT_COMMANDS.editor.lsp.rename, view);
            }
            return null;
          },
        },
        // Completes a function with its parentheses and opens parameter info.
        completionItems: (client, items, { textDocument, position }) => {
          const doc = client.workspace.getFile(textDocument.uri)?.doc;
          const next = doc?.line(position.line + 1).text.charAt(position.character);
          if (next === '(') {
            return items;
          }

          return items.map((item) => {
            if (
              (item.kind !== CompletionItemKind.Function && item.kind !== CompletionItemKind.Method) ||
              item.insertTextFormat === InsertTextFormat.Snippet
            ) {
              return item;
            }

            const text = `${item.textEdit?.newText ?? item.insertText ?? item.label}($0)`;
            return {
              ...item,
              insertText: text,
              textEdit: item.textEdit && { ...item.textEdit, newText: text },
              insertTextFormat: InsertTextFormat.Snippet,
              command: { title: 'Parameter info', command: 'editor.action.triggerParameterHints' },
            };
          });
        },
        commandHandlers: {
          'editor.action.triggerParameterHints': (_, view) =>
            commands.run(DEFAULT_COMMANDS.editor.lsp.showSignatureHelp, view),
        },
        // Each connection is a server of its own, for the worktree at `root`. A frame is one message.
        start: (root) =>
          new Promise<LanguageServerTransport>((resolve, reject) => {
            const socket = new WebSocket(`${SERVER}/?root=${encodeURIComponent(root.href)}`);
            socket.addEventListener('error', () =>
              reject(new Error(`No server at ${SERVER}. Is the plugin's \`serve\` script running?`)),
            );
            socket.addEventListener('open', () =>
              resolve({
                send(message) {
                  if (socket.readyState !== WebSocket.OPEN) {
                    throw new Error('The connection is closed');
                  }
                  socket.send(message);
                },
                onMessage(listener) {
                  const handle = (event: MessageEvent<string>) => listener(event.data);
                  socket.addEventListener('message', handle);
                  return () => socket.removeEventListener('message', handle);
                },
                onClose(listener) {
                  socket.addEventListener('close', listener);
                  return () => socket.removeEventListener('close', listener);
                },
                close: () => socket.close(),
              }),
            );
          }),
      },
    ]),
  );
}
