# Bridge

The contract between the Elsewise UI and its embedder: what an embedder provides beyond the web platform, on
`window.bridge`. Today the one embedder is the Electron app; the contract assumes none in particular.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/bridge <script>`.

This is a **source package**: `exports` points straight at `src/index.ts` and there is no build step.

## Rules

- **Contract only.** No implementation and no embedder's dependencies, such as `electron`; each embedder implements
  the contract its own way. A zod schema is contract: it says what a valid value is.
- **Schemas are the source of truth.** Declare a value's shape once, as a zod schema, and derive its type from it under
  the same name: `export const Theme = z.…`, then `export type Theme = z.infer<typeof Theme>`.
- **Relative imports only.** No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
