# Plugin

The contract between Elsewise and its plugins: what a plugin's main module exports, and what Elsewise provides it when
enabling it. Elsewise implements the contract; plugins build against it.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/frontend-plugin <script>`.

This is a **source package**: `exports` points straight at `src/` and there is no build step.

## Rules

- **Zod and `@elsewise/plugin` are the only dependencies**, for the contract's schemas, e.g. `Theme`. React and
  CodeMirror are peer dependencies.
- **Relative imports only**, without extensions. No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
