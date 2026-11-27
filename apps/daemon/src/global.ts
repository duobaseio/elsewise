import manifest from '../package.json' with { type: 'json' };

/**
 * The daemon's version.
 */
export const VERSION: string = typeof DAEMON_VERSION === 'undefined' ? manifest.version : DAEMON_VERSION;

/**
 * The platform the daemon runs on similar to the plugin's naming scheme (e.g. `linux-x64-musl`).
 */
export const TARGET: string = `${process.platform}-${process.arch}${musl() ? '-musl' : ''}`;

/** Whether the daemon runs on Linux with musl. */
function musl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }

  const { header } = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
  return header.glibcVersionRuntime === undefined;
}

// The daemon's version from package.json, defined by build.mjs and vitest.config.ts. Undefined when run through tsx,
// which reads package.json instead.
declare const DAEMON_VERSION: string | undefined;
