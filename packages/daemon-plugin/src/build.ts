import fs from 'node:fs';
import path from 'node:path';

/**
 * A Vite plugin that links the part's `node_modules` into the output folder.
 */
export function linkNodeModules() {
  /** Represents the `starter/daemon` path. */
  let root = '';

  /** Represents the compiled output's path. */
  let outDir = '';

  return {
    name: 'elsewise:link-node-modules',
    apply: 'build' as const,

    configResolved(config: { root: string; build: { outDir: string } }) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },

    writeBundle() {
      const modules = path.join(root, 'node_modules');
      const link = path.join(outDir, 'node_modules');

      if (link === modules || !fs.existsSync(modules)) {
        return;
      }

      fs.rmSync(link, { recursive: true, force: true });
      // Uses a junction on Windows as it only lets administrators create symbolic links.
      fs.symlinkSync(modules, link, 'junction');
    },
  };
}
