// Serves TypeScript's language server, `tsc --lsp`, over a WebSocket for the plugin to connect to. Run from the repo
// root:
//   pnpm --filter @elsewise/plugin-example-language-server serve
//
// Each connection starts a server in the worktree that its `root` query parameter names, a `file:` URL, and stops it
// when it closes. A frame is one JSON-RPC message, without LSP's headers.
//
// Commands typed into the terminal try out how Elsewise shows what servers report, on every connection:
//   message <error|warning|info> <text>  sends `window/showMessage`
//   fail [method]                         answers the next request, or the next one for `method`, with an error
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// Matches `src/main.ts`.
const PORT = 7300;
// The dev server and the built app. Browsers let any page open a WebSocket to localhost, so without this, any website
// could start servers.
const ORIGINS = new Set(['http://localhost:3000', 'app://elsewise']);
// The `window/showMessage` type for each `message` command's.
const MESSAGE_TYPES = { error: 1, warning: 2, info: 3 };
const TSC = path.join(path.dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc');

const sockets = new WebSocketServer({
  host: '127.0.0.1',
  port: PORT,
  verifyClient: ({ origin }) => ORIGINS.has(origin),
});

sockets.on('listening', () => {
  console.log(`[serve] listening on ws://127.0.0.1:${PORT}`);
  console.log('[serve] commands: message <error|warning|info> <text>, fail [method]');
});

// The method that the next request fails for, `*` for any, or `null` if none fails.
let failing = null;

createInterface({ input: process.stdin }).on('line', (line) => {
  const [command, ...rest] = line.trim().split(/\s+/);
  if (command === 'message' && Object.hasOwn(MESSAGE_TYPES, rest[0]) && rest.length > 1) {
    const message = {
      jsonrpc: '2.0',
      method: 'window/showMessage',
      params: { type: MESSAGE_TYPES[rest[0]], message: rest.slice(1).join(' ') },
    };
    for (const socket of sockets.clients) {
      socket.send(JSON.stringify(message));
    }
    console.log(`[serve] sent a message to ${sockets.clients.size} connection(s)`);
  } else if (command === 'fail') {
    failing = rest[0] ?? '*';
    console.log(`[serve] the next ${failing === '*' ? '' : `${failing} `}request fails`);
  } else if (command) {
    console.log('[serve] commands: message <error|warning|info> <text>, fail [method]');
  }
});

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
    const { id, method } = JSON.parse(message.toString('utf8'));
    if (failing !== null && id !== undefined && method !== undefined && (failing === '*' || failing === method)) {
      failing = null;
      console.log(`[serve] failed ${method}`);
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Failed by serve' } }));
      return;
    }

    server.stdin.write(`Content-Length: ${message.length}\r\n\r\n`);
    server.stdin.write(message);
  });
  socket.on('close', () => server.kill());
});
