# Plugin

What a plugin is, regardless of where its parts run: its `manifest.json`. `@elsewise/frontend-plugin` and
`@elsewise/daemon-plugin` depend on it and re-export it; the hosts read it to load a plugin.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/plugin <script>`.

This is a **source package**: `exports` points straight at `src/` and there is no build step.

## Rules

- **Zod is the only dependency**, for the manifest's schema.
- **Nothing with identity.** Types, schemas and pure helpers only, since a plugin that imports it inlines its own copy.
- **Relative imports only**, with `.ts` extensions. No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
