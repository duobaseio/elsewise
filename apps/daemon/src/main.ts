import { randomBytes } from 'node:crypto';
import { daemonDataDir, projectDir } from '@elsewise/core/node';
import { createDaemon } from './daemon';
import { loginEnvironment } from './environment';
import { startWebSocketServer } from './websocket';

const port = Number(process.env.ELSEWISE_DAEMON_PORT ?? 0);
const token = process.env.ELSEWISE_DAEMON_TOKEN ?? randomBytes(32).toString('base64url');
const dataDirectory = process.env.ELSEWISE_DAEMON_DATA ?? daemonDataDir();
const codeDirectory = process.env.ELSEWISE_DAEMON_CODE ?? projectDir();

// Everything the daemon runs inherits its environment.
Object.assign(process.env, await loginEnvironment());

const daemon = await createDaemon({ dataDirectory, codeDirectory });
const server = await startWebSocketServer(daemon, { port, token });
process.stdout.write(`${JSON.stringify({ port: server.port, token })}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().finally(() => daemon.close());
  });
}
