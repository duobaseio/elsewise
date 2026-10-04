// Copies the web app's production build into out/renderer so electron-builder can
// package it into the asar. If the web build doesn't exist yet, writes a placeholder
// so the desktop package still builds and launches on its own.
import { access, cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const webDist = path.resolve(desktopRoot, '../web/dist');
const outRenderer = path.resolve(desktopRoot, 'out/renderer');

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

await mkdir(outRenderer, { recursive: true });

if (await exists(webDist)) {
  await cp(webDist, outRenderer, { recursive: true });
  console.log('[copy-renderer] copied apps/web/dist -> out/renderer');
} else {
  const placeholder = `<!doctype html>
<meta charset="utf-8" />
<title>Elsewise</title>
<body style="font-family: system-ui, sans-serif; padding: 2rem; line-height: 1.5">
  <h1>Renderer not built</h1>
  <p>Build the web app first, then rebuild the desktop package:</p>
  <pre>pnpm --filter @elsewise/web build</pre>
</body>`;
  await writeFile(path.join(outRenderer, 'index.html'), placeholder);
  console.log('[copy-renderer] apps/web/dist not found — wrote placeholder index.html');
}
