import path from 'node:path';
import { createInterface } from 'node:readline';
import { DaemonConnection } from '@elsewise/bridge';
import { app, ipcMain, utilityProcess } from 'electron';

const DAEMON = path.join(__dirname, '../daemon/daemon.mjs');

/**
 * Starts the daemon, and handles `daemon:connection`.
 *
 * The daemon stops when the app quits.
 */
export function handleDaemon(): void {
  const daemon = utilityProcess.fork(DAEMON, [], {
    serviceName: 'Elsewise Daemon',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const connection = new Promise<DaemonConnection>((resolve, reject) => {
    daemon.once('exit', (code) => reject(new Error(`daemon: exited with code ${code} before it started`)));
    if (daemon.stdout === null) {
      reject(new Error('daemon: no stdout'));
      return;
    }

    createInterface({ input: daemon.stdout }).once('line', (line) => {
      try {
        resolve(DaemonConnection.parse(JSON.parse(line)));
      } catch (error) {
        reject(error);
      }
    });
  });
  connection.catch((error) => console.error(error));

  ipcMain.handle('daemon:connection', () => connection);
  app.on('will-quit', () => daemon.kill());
}
