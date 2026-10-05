import { randomBytes } from 'node:crypto';
import { createDaemon } from './daemon';
import { startWebSocketServer } from './websocket';

const port = Number(process.env.ELSEWISE_DAEMON_PORT ?? 0);
const token = process.env.ELSEWISE_DAEMON_TOKEN ?? randomBytes(32).toString('base64url');

const server = await startWebSocketServer(createDaemon(), { port, token });
process.stdout.write(`${JSON.stringify({ port: server.port, token })}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close();
  });
}
