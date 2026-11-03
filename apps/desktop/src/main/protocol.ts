import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { frontendDataDir } from '@elsewise/core/node';
import { net, session } from 'electron';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const RENDERER = path.join(__dirname, '../renderer');
const PLUGINS = path.join(frontendDataDir(), 'plugins');
const PLUGIN = /^\/plugins\/([A-Za-z0-9][A-Za-z0-9._-]*)\/(.*)$/;

/**
 * Serves `app://elsewise/` from two folders:
 *
 * - `/plugins/<id>/<path>` → `<frontend data folder>/plugins/<id>/<path>`, an installed plugin's folder
 * - any other `<path>` → `<renderer>/<path>`, the Elsewise applications
 *
 * When there is no file in a plugin's folder → 404. When there is none in `<renderer>`, the response depends on the
 * request's `Accept` header:
 * - includes `text/html`, so a page load of a route →`<renderer>/index.html`, for the router to render
 * - anything else, so a missing module or asset → 404
 */
export function handleAppScheme(): void {
  session.defaultSession.protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'elsewise') {
      return new Response(null, { status: 404 });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }

    let root: string;
    let subpath: string;
    if (pathname.startsWith('/plugins/')) {
      const plugin = PLUGIN.exec(pathname);
      if (!plugin) {
        return new Response(null, { status: 404 });
      }

      root = path.join(PLUGINS, plugin[1]);
      subpath = plugin[2];
    } else {
      root = RENDERER;
      subpath = pathname.slice(1);
    }

    // Chromium does not resolve a `..` behind an escaped `/` (`%2f`) or `\` (`%5c`), so it can still climb out of the
    // root.
    const file = path.join(root, subpath);
    if (path.relative(root, file).split(path.sep)[0] === '..') {
      return new Response(null, { status: 403 });
    }

    const response = await net.fetch(pathToFileURL(file).href).catch(() => undefined);
    if (response) {
      return new Response(response.body, {
        headers: { 'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' },
      });
    }

    if (root === RENDERER && request.headers.get('Accept')?.includes('text/html')) {
      const index = await net.fetch(pathToFileURL(path.join(RENDERER, 'index.html')).href);
      return new Response(index.body, { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response(null, { status: 404 });
  });
}
