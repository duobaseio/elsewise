# API

The contract between Elsewise and its plugins: what a plugin's main module exports, and what Elsewise provides it when
activating it. Elsewise implements the contract; plugins build against it.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/api <script>`.

## Layout

| Path            | What it is                                                                         |
|-----------------|------------------------------------------------------------------------------------|
| `src/index.ts`  | The public surface; consumers import `@elsewise/api`.                              |
| `src/plugin.ts` | `Plugin`, a plugin's main module, and `PluginContext`, what Elsewise provides it.  |
|                 | Also `SHARED_MODULES`, the modules Elsewise serves and plugins leave external.     |

This is a **source package**: `exports` points straight at `src/index.ts` and there is no build step.

## Rules

- **Contract only.** No implementation and no runtime dependencies; React is a peer dependency, imported type-only.
- **Relative imports only.** No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
