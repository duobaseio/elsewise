// Copies the daemon's build into out/daemon, for main to start.
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const daemonDist = path.resolve(here, '../../daemon/dist');
const outDaemon = path.resolve(here, '../out/daemon');

await rm(outDaemon, { recursive: true, force: true });
await cp(daemonDist, outDaemon, { recursive: true });
console.log('[copy-daemon] copied apps/daemon/dist -> out/daemon');
