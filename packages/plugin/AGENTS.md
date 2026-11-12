# Plugin

What a plugin is, regardless of where its parts run: its `manifest.json`, and the types a part's main module uses on
either side. `@elsewise/frontend-plugin` and `@elsewise/daemon-plugin` depend on it and re-export it; the hosts read
it to load a plugin.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/plugin <script>`.

This is a **source package**: `exports` points straight at `src/`, and nothing in this repo needs a build step. `build`
packs `elsewise-plugin-0.0.0.tgz`, the package as it would be published, for a consumer without a bundler: the
marketplace service depends on the tarball, since it cannot run TypeScript sources. tsdown bundles the modules, their
declarations and the command into `dist/`, as `tsdown.config.ts` configures; `pnpm pack` then packs `dist/`, with
`publishConfig` pointing `exports` and `bin` at it. The service reinstalls to pick up a new tarball.

`bin/elsewise-plugin.mjs` is the `elsewise-plugin` command, which a plugin's `build` runs. `elsewise-plugin manifest`
writes the plugin's `dist/manifest.json`: its `manifest.json`, plus the listing fields from its `package.json`. It
fails on a manifest the schema refuses. In this repo it runs from the sources; `dist/` has it built.

## Rules

- **Zod and semver are the only dependencies**, for the manifest's schema and the versions in it.
- **Nothing with identity.** Types, schemas and pure helpers only, since a plugin that imports it inlines its own copy.
- **Relative imports only**, without extensions. No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
