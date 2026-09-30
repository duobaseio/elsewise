import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Under Vite's 4 KB `assetsInlineLimit` a plainly imported SVG becomes a `data:` URI in the initial JS chunk, whether or
// not a file of that type is ever on screen. The emitter writes `?no-inline` on every import; this pins it.
test('every vendored icon import opts out of inlining', () => {
  const source = readFileSync(fileURLToPath(new URL('./file-icons.gen.ts', import.meta.url)), 'utf8');
  const imports = [...source.matchAll(/from '([^']+\.svg[^']*)'/g)].map((m) => m[1]);

  const vendored = readdirSync(fileURLToPath(new URL('../assets/file-icons/', import.meta.url)));

  expect(imports.length).toBe(vendored.length);
  expect(imports.filter((specifier) => !specifier.endsWith('?no-inline'))).toEqual([]);
});
