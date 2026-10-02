import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, session } from 'electron';
import { dataLocalDir } from './fs';

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
const PLUGINS = path.join(dataLocalDir(), 'plugins');

/**
 * Serves `app://elsewise/` from two folders:
 *
 * - `/plugins/<path>` → `<data folder>/plugins/<path>`, the installed plugins
 * - any other `<path>` → `<renderer>/<path>`, the Elsewise applications
 *
 * When there is no file at that location, the response depends on the request's `Accept` header:
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

    const [root, subpath] = pathname.startsWith('/plugins/')
      ? [PLUGINS, pathname.slice('/plugins/'.length)]
      : [RENDERER, pathname.slice(1)];

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

    if (request.headers.get('Accept')?.includes('text/html')) {
      const index = await net.fetch(pathToFileURL(path.join(RENDERER, 'index.html')).href);
      return new Response(index.body, { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response(null, { status: 404 });
  });
}
