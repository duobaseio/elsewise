import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';

const run = promisify(execFile);

/**
 * A Vite plugin that serves the files of the repository at `root` as they are in git, for the editor's diffs.
 *
 * `GET /@elsewise/git/show?base=index|head|branch&path=<path>` returns the file at `path` in the index, at `HEAD`, or
 * where `HEAD` branched off the default branch. It returns 404 if the file does not exist there. For `branch`, the
 * `X-Elsewise-Branch` header names the default branch, even with 404.
 */
// TODO: Remove once the daemon's git service reads files at a revision.
export function fakeGit(root: string): Plugin {
  return {
    name: 'fake-git',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/@elsewise/git/show', async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const base = url.searchParams.get('base');
        const file = url.searchParams.get('path');
        if (
          (base !== 'index' && base !== 'head' && base !== 'branch') ||
          file === null ||
          path.isAbsolute(file) ||
          file.split(/[\\/]/).includes('..')
        ) {
          response.statusCode = 400;
          response.end();
          return;
        }

        try {
          let revision = base === 'index' ? '' : 'HEAD';
          if (base === 'branch') {
            const branch = await defaultBranch(root);
            response.setHeader('X-Elsewise-Branch', branch);
            revision = (await run('git', ['merge-base', 'HEAD', branch], { cwd: root })).stdout.trim();
          }
          const { stdout } = await run('git', ['show', `${revision}:${file}`], {
            cwd: root,
            maxBuffer: 64 * 1024 * 1024,
          });
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(stdout);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    },
  };
}

// Returns the default branch, which is `origin`'s if known, else `main`.
async function defaultBranch(root: string): Promise<string> {
  return run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: root }).then(
    ({ stdout }) => stdout.trim(),
    () => 'main',
  );
}
