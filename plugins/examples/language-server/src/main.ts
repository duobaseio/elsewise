import type { LanguageServerTransport, PluginContext } from '@elsewise/plugin';

// Matches `scripts/serve.mjs`.
const SERVER = 'ws://127.0.0.1:7300';

/**
 * Called when Elsewise enables the plugin.
 */
export function enable({ editor, subscriptions }: PluginContext): void {
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
