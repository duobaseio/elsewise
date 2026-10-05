# Plugin

The contract between Elsewise and its plugins: what a plugin's main module exports, and what Elsewise provides it when
enabling it. Elsewise implements the contract; plugins build against it.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/plugin <script>`.

This is a **source package**: `exports` points straight at `src/` and there is no build step.

## Rules

- **Contract only.** No implementation. Zod is the only runtime dependency, used for the contract's schemas, e.g.
  `Theme`. React is a peer dependency, imported type-only.
- **Relative imports only**, with `.ts` extensions. No aliases. Node loads this source as-is when
  `apps/web/vite.config.ts` imports it, and Node doesn't map `.js` to `.ts`.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
