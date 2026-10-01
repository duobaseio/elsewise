// Dev runner for the Electron shell (no electron-vite — plain glue):
//   1. compile main/preload with tsc
//   2. wait for the web app's Vite dev server to be reachable
//   3. launch Electron pointed at it
//   4. rebuild + restart Electron when main/preload sources change
//
// The renderer's HMR is handled entirely by Vite in apps/web — nothing to do here.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import electronPath from 'electron';

// Matches apps/web's dev server (`vite dev --port 3000`). Override with:
//   ELECTRON_RENDERER_URL=http://localhost:4000 pnpm --filter @elsewise/desktop dev
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000';

const isWin = process.platform === 'win32';

function tscBuild() {
  return new Promise((resolve, reject) => {
    const p = spawn('tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit', shell: isWin });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('tsc failed'))));
  });
}

async function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Renderer dev server not reachable at ${url} (is apps/web running?)`);
}

let electron;
function startElectron() {
  if (electron) {
    electron.removeAllListeners('exit');
    electron.kill();
  }
  electron = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RENDERER_URL: RENDERER_URL },
  });
  // Quit the dev runner when the app window is closed by the user.
  electron.on('exit', () => process.exit(0));
}

// Electron is a child, not a member of a shared process group: pnpm --parallel puts each script in its own group, so
// an IDE stopping the root `dev` kills pnpm alone and leaves this runner and its Electron behind. Kill Electron when
// a signal does arrive, and when it does not — the parent is gone, so we have been reparented to launchd (ppid 1).
function shutdown() {
  if (electron) {
    electron.removeAllListeners('exit');
    electron.kill();
  }
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, shutdown);
const parent = process.ppid;
setInterval(() => {
  if (process.ppid !== parent) shutdown();
}, 1000).unref();

await tscBuild();
console.log(`[dev] waiting for renderer at ${RENDERER_URL} ...`);
await waitForUrl(RENDERER_URL);
startElectron();

// Rebuild + restart Electron on main/preload changes (debounced).
let timer;
watch('src', { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      await tscBuild();
      startElectron();
    } catch (err) {
      console.error('[dev]', err.message);
    }
  }, 150);
});
