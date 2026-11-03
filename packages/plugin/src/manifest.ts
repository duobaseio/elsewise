import * as z from 'zod';

export type Manifest = z.infer<typeof Manifest>;
export type FrontendManifestPart = z.infer<typeof FrontendManifestPart>;
export type DaemonManifestPart = z.infer<typeof DaemonManifestPart>;

const SEMVER = new RegExp(
  String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)` +
    String.raw`(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?` +
    String.raw`(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`,
);

// A range of versions, in node-semver's grammar: comparator sets joined by `||`, each a hyphen range or comparators
// over partial versions, e.g. `^1.2.0`, `>=1.2.3 <2.0.0`, `1.2.3 - 2.3.4`, `1.x`, `*`.
const XR = String.raw`(?:0|[1-9]\d*|[xX*])`;
const PARTIAL =
  XR +
  String.raw`(?:\.${XR}(?:\.${XR}` +
  String.raw`(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?` +
  String.raw`(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?)?)?`;
const SIMPLE = String.raw`(?:[~^]|[<>]=?|=)?\s*${PARTIAL}`;
const SET = String.raw`(?:${PARTIAL}\s+-\s+${PARTIAL}|${SIMPLE}(?:\s+${SIMPLE})*)`;
const RANGE = new RegExp(String.raw`^\s*${SET}(?:\s*\|\|\s*${SET})*\s*$`);

/**
 * A plugin's id, typically reverse domain name notation, e.g. `io.duobase.elsewise`.
 */
export const PluginId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/**
 * A plugin's `manifest.json`.
 *
 * A plugin has a frontend part, which runs in the app, a daemon part, which runs in the daemon, or both. The parts
 * share the manifest's id and version.
 */
export const Manifest = z.lazy(() =>
  z
    .object({
      /**
       * The plugin's id, typically reverse domain name notation, e.g. `io.duobase.elsewise`.
       *
       * Must be the name of the plugin's folder.
       */
      id: PluginId,

      /**
       * The plugin's display name. Cannot be blank.
       */
      name: z.string().regex(/\S/),

      /**
       * The plugin's version, following SemVer, e.g. `1.2.3`.
       */
      version: z.string().regex(SEMVER),

      /**
       * The version range of Elsewise the plugin works with, e.g. `^1.2.0`. The app and the daemon each refuse a plugin
       * that excludes their version.
       */
      elsewise: z.string().regex(RANGE),

      /**
       * The plugin's frontend part, which runs in the app.
       */
      frontend: FrontendManifestPart.optional(),

      /**
       * The plugin's daemon part, which runs in the daemon.
       */
      daemon: DaemonManifestPart.optional(),
    })
    .refine((manifest) => manifest.frontend !== undefined || manifest.daemon !== undefined, {
      error: 'A plugin has a frontend part, daemon part, or both',
    }),
);

/**
 * A plugin's frontend part, which runs in the app.
 */
export const FrontendManifestPart = z.object({
  /**
   * The plugins the frontend part depends on, each by id with the range of compatible versions,
   * e.g. `{ "io.example.git": "^2.1.0" }`.
   */
  // TODO: Check at install, once there is a marketplace.
  dependencies: z.record(PluginId, z.string().regex(RANGE)).optional(),

  /**
   * The main module's path. Undefined if the plugin ships only themes and/or keymaps.
   */
  main: z.string().regex(/\S/).optional(),

  /**
   * The compatible versions of the plugin's daemon part, e.g. `^1.3.0`. Defaults to the same version.
   */
  // TODO: Check when a daemon reports its plugins, once the daemon loads plugins.
  daemon: z.string().regex(RANGE).optional(),
});

/**
 * A plugin's daemon part, which runs in the daemon.
 */
export const DaemonManifestPart = z.object({
  /**
   * The plugins the daemon part depends on, each by id with the range of compatible versions,
   * e.g. `{ "io.example.git": "^2.1.0" }`.
   */
  // TODO: Check at install, once there is a marketplace.
  dependencies: z.record(PluginId, z.string().regex(RANGE)).optional(),

  /**
   * The main module's path. Cannot be blank. Defaults to `main.js`.
   */
  main: z.string().regex(/\S/).default('main.js'),

  /**
   * The compatible versions of the plugin's frontend part, e.g. `^1.2.0`. Defaults to the same version.
   */
  // TODO: Check when a daemon reports its plugins, once the daemon loads plugins.
  frontend: z.string().regex(RANGE).optional(),
});
