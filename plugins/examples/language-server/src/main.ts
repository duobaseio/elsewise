import { type Application, DEFAULT_COMMANDS, type LanguageServerTransport, type PluginContext } from '@elsewise/plugin';
import type { TextDocumentPositionParams } from 'vscode-languageserver-protocol';

// Matches `scripts/serve.mjs`.
const SERVER = 'ws://127.0.0.1:7300';

/**
 * Called when Elsewise enables the plugin.
 */
export function enable({ editor, commands }: Application, { subscriptions }: PluginContext): void {
  subscriptions.push(
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
