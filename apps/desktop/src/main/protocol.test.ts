import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { session } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handleAppScheme } from './protocol';

// Hoisted with the mocks below, which the imports above already use.
const { DATA, files } = vi.hoisted(() => ({
  DATA: `${process.cwd()}/test-data`,
  // The files on disk, by `file:` url. Electron's `net.fetch` rejects for any other.
  files: new Map<string, string>(),
}));
const PLUGINS = path.join(DATA, 'plugins');
const RENDERER = path.join(__dirname, '../renderer');

vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(async (url: string) => {
      const body = files.get(url);
      if (body === undefined) {
        throw new Error('net::ERR_FILE_NOT_FOUND');
      }

      return new Response(body);
    }),
  },
  session: { defaultSession: { protocol: { handle: vi.fn() } } },
}));
vi.mock('@elsewise/core', () => ({ dataLocalDir: () => DATA }));

beforeEach(() => {
  files.clear();
  files.set(pathToFileURL(path.join(RENDERER, 'index.html')).href, 'index');
});

// Returns the response to a request for `url`.
function request(url: string, { accept = '*/*' }: { accept?: string } = {}) {
  handleAppScheme();

  const handler = vi.mocked(session.defaultSession.protocol.handle).mock.calls[0]?.[1] as unknown as (
    request: Request,
  ) => Promise<Response>;
  return handler(new Request(url, { headers: { Accept: accept } }));
}

describe('handleAppScheme', () => {
  test("serves a file from a plugin's bundle", async () => {
    files.set(pathToFileURL(path.join(PLUGINS, 'hello', 'bundle', 'main.js')).href, 'plugin');

    const response = await request('app://elsewise/plugins/hello/bundle/main.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/javascript');
    expect(await response.text()).toBe('plugin');
  });

  test('serves any other file from the renderer folder', async () => {
    files.set(pathToFileURL(path.join(RENDERER, 'assets', 'index.css')).href, 'styles');

    const response = await request('app://elsewise/assets/index.css');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/css');
    expect(await response.text()).toBe('styles');
  });

  test('serves a file of an unknown type as a byte stream', async () => {
    files.set(pathToFileURL(path.join(PLUGINS, 'hello', 'bundle', 'data.bin')).href, 'bytes');

    const response = await request('app://elsewise/plugins/hello/bundle/data.bin');

    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  test('serves the index for a page load of a route', async () => {
    const response = await request('app://elsewise/settings', { accept: 'text/html,application/xhtml+xml' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(await response.text()).toBe('index');
  });

  test("responds 404 for a page load of a missing file in a plugin's bundle", async () => {
    const response = await request('app://elsewise/plugins/hello/bundle/missing.html', {
      accept: 'text/html,application/xhtml+xml',
    });

    expect(response.status).toBe(404);
  });

  test('responds 404 for a missing module', async () => {
    const response = await request('app://elsewise/plugins/hello/bundle/missing.js');

    expect(response.status).toBe(404);
  });

  test('responds 404 for another host', async () => {
    files.set(pathToFileURL(path.join(PLUGINS, 'hello', 'bundle', 'main.js')).href, 'plugin');

    const response = await request('app://other/plugins/hello/bundle/main.js');

    expect(response.status).toBe(404);
  });

  test('responds 400 for a malformed escape', async () => {
    const response = await request('app://elsewise/plugins/hello/bundle/%E0%A4%A');

    expect(response.status).toBe(400);
  });

  test.each([
    'app://elsewise/plugins/hello/settings.json',
    'app://elsewise/plugins/hello/main.js',
    'app://elsewise/plugins/..%2f..%2fsecret.js',
    'app://elsewise/plugins/hello/bundle',
  ])('responds 404 for %s, which is outside a bundle', async (url) => {
    // Everything it could reach exists, so only the check refuses it.
    for (const file of [
      path.join(PLUGINS, 'hello', 'settings.json'),
      path.join(PLUGINS, 'hello', 'main.js'),
      path.join(DATA, 'secret.js'),
      path.join(PLUGINS, 'hello', 'bundle'),
    ]) {
      files.set(pathToFileURL(file).href, 'secret');
    }

    const response = await request(url);

    expect(response.status).toBe(404);
  });

  test.each([
    'app://elsewise/plugins/hello/bundle/..%2f..%2f..%2f..%2fsecret.js',
    'app://elsewise/plugins/hello/bundle/..%2fsettings.json',
    'app://elsewise/..%2fsecret.js',
  ])('responds 403 for %s, which climbs out of its folder', async (url) => {
    // Everything it could reach exists, so only the check refuses it.
    for (const file of [
      path.join(DATA, 'secret.js'),
      path.join(PLUGINS, 'hello', 'settings.json'),
      path.join(RENDERER, '..', 'secret.js'),
    ]) {
      files.set(pathToFileURL(file).href, 'secret');
    }

    const response = await request(url);

    expect(response.status).toBe(403);
  });
});
