import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { dataLocalDir } from '@elsewise/fs';
import electron from 'electron';
import { _electron, type ElectronApplication } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const DESKTOP = path.join(__dirname, '../..');
const PLUGIN_PAGE = 'app://elsewise/plugins/test/bundle/page.html';
// Evaluated in a page, as a string so that Vitest leaves the import alone.
const IMPORT_PLUGIN = `import('app://elsewise/plugins/test/bundle/main.js').then((module) => module.loaded, () => 'refused')`;

// Two pages on origins of their own: the dev server's, and some other site's.
let servers: http.Server[];
let dev: string;
let other: string;
// The home folder the app keeps its data under.
let home: string;
let app: ElectronApplication | undefined;

beforeAll(async () => {
  execFileSync(process.execPath, ['scripts/bundle.mjs'], { cwd: DESKTOP, stdio: 'inherit' });

  servers = [];
  [dev, other] = await Promise.all(
    [0, 1].map(async () => {
      const server = http.createServer((_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>test</title>');
      });
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    }),
  );
});

afterAll(() => {
  for (const server of servers) {
    server.close();
  }
});

beforeEach(() => {
  // Where each platform's data folder is looked up, so the app, which inherits these, leaves the real one alone.
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'elsewise-test-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_DATA_HOME', path.join(home, 'data'));
  vi.stubEnv('LOCALAPPDATA', home);

  const plugin = path.join(dataLocalDir(), 'plugins', 'test', 'bundle');
  fs.mkdirSync(plugin, { recursive: true });
  fs.writeFileSync(path.join(plugin, 'main.js'), 'export const loaded = true;');
  fs.writeFileSync(path.join(plugin, 'page.html'), '<!doctype html><title>test</title>');
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

// Runs the app, in development if `rendererUrl` is the dev server's url, and returns what `page` gets from importing a
// plugin's main module: its `loaded` export, or `refused`.
async function importFrom(page: string, rendererUrl?: string): Promise<unknown> {
  vi.stubEnv('ELECTRON_RENDERER_URL', rendererUrl);
  // In Node, the package is the path of Electron's binary.
  app = await _electron.launch({ executablePath: electron as unknown as string, args: [DESKTOP] });

  const window = await app.firstWindow();
  await window.goto(page);
  return window.evaluate(IMPORT_PLUGIN);
}

describe('the app scheme', () => {
  test("lets the app's own page import a plugin when packaged", async () => {
    expect(await importFrom(PLUGIN_PAGE)).toBe(true);
  });

  test('refuses another origin when packaged', async () => {
    expect(await importFrom(other)).toBe('refused');
  });

  test("lets the dev server's page import a plugin in development", async () => {
    expect(await importFrom(dev, dev)).toBe(true);
  });
});
