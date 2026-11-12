import valid from 'semver/functions/valid.js';
import validRange from 'semver/ranges/valid.js';
import * as z from 'zod';

export type Manifest = z.infer<typeof Manifest>;
export type FrontendManifestPart = z.infer<typeof FrontendManifestPart>;
export type DaemonManifestPart = z.infer<typeof DaemonManifestPart>;

const Version = z.string().refine((version) => valid(version) === version, { error: 'Not a version' });

// A range of versions (e.g. `^1.2.0`, `>=1.2.3 <2.0.0`, `1.2.3 - 2.3.4`, `1.x`, `*`).
const VersionRange = z
  .string()
  .refine((range) => /\S/.test(range) && validRange(range) !== null, { error: 'Not a range of versions' });

// An `http` or `https` URL on any host (e.g. `http://localhost:3000`).
const HttpUrl = z.url({ protocol: /^https?$/ });

/** A plugin's id, typically reverse domain name notation (e.g. `io.duobase.elsewise`). */
export const PluginId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/**
 * A plugin's `manifest.json`.
 *
 * A plugin has a frontend part, which runs in the app, and may have a daemon part, which runs in the daemon. The parts
 * share the manifest's id and version.
 */
export const Manifest = z.lazy(() =>
  z.object({
    /**
     * The plugin's id, typically reverse domain name notation (e.g. `io.duobase.elsewise`).
     *
     * Must be the name of the plugin's folder.
     */
    id: PluginId,

    /** The plugin's display name. Cannot be blank, span several lines, or be longer than 50 characters. */
    name: z
      .string()
      .regex(/^.*\S.*$/)
      .max(50),

    /** The plugin's version. */
    version: Version,

    /** A one-line summary of the plugin. Cannot be blank, or longer than 200 characters. */
    description: z
      .string()
      .regex(/^.*\S.*$/)
      .max(200)
      .optional(),

    /** The URL of the plugin's homepage (e.g. `https://example.com/git`). */
    homepage: HttpUrl.optional(),

    /** The URL of the plugin's source repository (e.g. `https://github.com/example/git`). */
    repository: HttpUrl.optional(),

    /** The URL of the plugin's issue tracker (e.g. `https://github.com/example/git/issues`). */
    issues: HttpUrl.optional(),

    /**
     * The plugin's license as an SPDX expression (e.g. `MIT` or `MIT OR Apache-2.0`).
     *
     * The actual license values are not checked. Unknown license will be shown a generic fallback message on the UI.
     */
    license: z
      .string()
      .regex(/^[A-Za-z0-9(][A-Za-z0-9.+:() -]*$/)
      .max(100)
      .optional(),

    /**
     * The topics the marketplace finds the plugin by (e.g. `["git", "version-control"]`). Each is lowercase letters,
     * digits and hyphens, and appears once.
     */
    topics: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]*$/)
          .max(50),
      )
      .max(20)
      .refine((topics) => new Set(topics).size === topics.length, { error: 'A topic appears once' })
      .optional(),

    /** The version range of Elsewise the plugin works with (e.g. `^1.2.0`). */
    elsewise: VersionRange,

    /** The plugin's frontend part, which runs in the app. */
    frontend: FrontendManifestPart,

    /** The plugin's daemon part, which runs in the daemon. Undefined if the plugin runs only in the app. */
    daemon: DaemonManifestPart.optional(),
  }),
);

/** A plugin's frontend part, which runs in the app. */
export const FrontendManifestPart = z.object({
  /**
   * The plugins the frontend part depends on, each by id with the range of compatible versions
   * (e.g. `{ "io.example.git": "^2.1.0" }`).
   */
  // TODO: Check at install, once there is a marketplace.
  dependencies: z.record(PluginId, VersionRange).optional(),

  /** The main module's path. Undefined if the plugin ships only themes and/or keymaps. */
  main: z.string().regex(/\S/).optional(),

  /** The compatible versions of the plugin's daemon part (e.g. `^1.3.0`). Defaults to the same version. */
  // TODO: Check against the other part's version, once the daemon reports its plugins to the app.
  daemon: VersionRange.optional(),
});

/** A plugin's daemon part, which runs in the daemon. */
export const DaemonManifestPart = z.object({
  /**
   * The plugins the daemon part depends on, each by id with the range of compatible versions
   * (e.g. `{ "io.example.git": "^2.1.0" }`).
   */
  // TODO: Check at install, once there is a marketplace.
  dependencies: z.record(PluginId, VersionRange).optional(),

  /** The main module's path. Cannot be blank. Defaults to `main.js`. */
  main: z.string().regex(/\S/).default('main.js'),

  /** The compatible versions of the plugin's frontend part (e.g. `^1.2.0`). Defaults to the same version. */
  // TODO: Check against the other part's version, once the daemon reports its plugins to the app.
  frontend: VersionRange.optional(),
});
