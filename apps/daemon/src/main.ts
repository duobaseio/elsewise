import { randomBytes } from 'node:crypto';
import { codeDir, daemonDataDir } from '@elsewise/core';
import { createDaemon } from './daemon';
import { startWebSocketServer } from './websocket';

const port = Number(process.env.ELSEWISE_DAEMON_PORT ?? 0);
const token = process.env.ELSEWISE_DAEMON_TOKEN ?? randomBytes(32).toString('base64url');
const dataDirectory = process.env.ELSEWISE_DAEMON_DATA ?? daemonDataDir();
const codeDirectory = process.env.ELSEWISE_DAEMON_CODE ?? codeDir();

const daemon = createDaemon({ dataDirectory, codeDirectory });
const server = await startWebSocketServer(daemon, { port, token });
process.stdout.write(`${JSON.stringify({ port: server.port, token })}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().finally(() => daemon.close());
  });
}
