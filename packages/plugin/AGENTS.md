# Plugin

The contract between Elsewise and its plugins: what a plugin's main module exports, and what Elsewise provides it when
enabling it. Elsewise implements the contract; plugins build against it.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/plugin <script>`.

## Layout

| Path            | What it is                                                                         |
|-----------------|------------------------------------------------------------------------------------|
| `src/index.ts`  | The public surface; consumers import `@elsewise/plugin`.                           |
| `src/plugin.ts` | `Plugin`, a plugin's main module, and `PluginContext`, what Elsewise provides it.  |
| `src/build.ts`  | `@elsewise/plugin/build`, for build scripts: `PEER_MODULES`, the modules Elsewise  |
|                 | serves and plugins leave external.                                                 |

This is a **source package**: `exports` points straight at `src/` and there is no build step.

## Rules

- **Contract only.** No implementation and no runtime dependencies; React is a peer dependency, imported type-only.
- **Relative imports only**, with `.ts` extensions. No aliases. Node loads this source as-is when
  `apps/web/vite.config.ts` imports it, and Node doesn't map `.js` to `.ts`.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
