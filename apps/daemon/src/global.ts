import manifest from '../package.json' with { type: 'json' };

/** The daemon's version. */
export const VERSION: string = typeof DAEMON_VERSION === 'undefined' ? manifest.version : DAEMON_VERSION;

// The daemon's version from package.json, defined by build.mjs and vitest.config.ts. Undefined when run through tsx,
// which reads package.json instead.
declare const DAEMON_VERSION: string | undefined;
