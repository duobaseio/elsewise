// Serves TypeScript's language server, `tsc --lsp`, over a WebSocket for the plugin to connect to. Run from the repo
// root:
//   pnpm --filter @elsewise/plugin-example-language-server serve
//
// Each connection starts a server in the worktree that its `root` query parameter names, a `file:` URL, and stops it
// when it closes. A frame is one JSON-RPC message, without LSP's headers.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// Matches `src/main.ts`.
const PORT = 7300;
// The dev server and the built app. Browsers let any page open a WebSocket to localhost, so without this, any website
// could start servers.
const ORIGINS = new Set(['http://localhost:3000', 'app://elsewise']);
const TSC = path.join(path.dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc');

const sockets = new WebSocketServer({
  host: '127.0.0.1',
  port: PORT,
  verifyClient: ({ origin }) => ORIGINS.has(origin),
});

sockets.on('listening', () => console.log(`[serve] listening on ws://127.0.0.1:${PORT}`));

sockets.on('connection', (socket, request) => {
  let root;
  try {
    root = fileURLToPath(new URL(request.url ?? '', 'ws://127.0.0.1').searchParams.get('root') ?? '');
  } catch {
    socket.close(1008, 'The root must be a file URL');
    return;
  }

  console.log(`[serve] starting a server in ${root}`);
  const server = spawn(process.execPath, [TSC, '--lsp', '--stdio'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
  server.on('error', (error) => {
    console.error(`[serve] the server in ${root} failed`, error);
    socket.close(1011, 'The server failed');
  });
  server.on('exit', (code) => {
    console.log(`[serve] the server in ${root} exited with ${code}`);
    socket.close();
  });
  // Writing to a server that exited fails, and the exit closes the socket anyway.
  server.stdin.on('error', () => {});

  // Splits the server's output into messages, each after a `Content-Length` header that counts its bytes.
  let output = Buffer.alloc(0);
  server.stdout.on('data', (chunk) => {
    output = Buffer.concat([output, chunk]);
    for (;;) {
      const end = output.indexOf('\r\n\r\n');
      const length = Number(/Content-Length: *(\d+)/i.exec(output.subarray(0, end).toString('ascii'))?.[1]);
      // Also stops at a header without a length, rather than spinning on it.
      if (end === -1 || !(output.length >= end + 4 + length)) {
        break;
      }

      socket.send(output.subarray(end + 4, end + 4 + length).toString('utf8'));
      output = output.subarray(end + 4 + length);
    }
  });

  socket.on('message', (message) => {
    server.stdin.write(`Content-Length: ${message.length}\r\n\r\n`);
    server.stdin.write(message);
  });
  socket.on('close', () => server.kill());
});
