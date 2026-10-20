import * as z from 'zod';

export type Manifest = z.infer<typeof Manifest>;

const SEMVER = new RegExp(
  String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)` +
    String.raw`(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?` +
    String.raw`(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`,
);

/**
 * A plugin's id, typically reverse domain name notation, e.g. `io.duobase.elsewise`.
 */
export const PluginId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/**
 * A plugin's `manifest.json`.
 */
export const Manifest = z.lazy(() =>
  z.object({
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
     * The path of the plugin's main module in its `bundle` folder. Cannot be blank. Defaults to `main.js`.
     */
    main: z.string().regex(/\S/).default('main.js'),
  }),
);
