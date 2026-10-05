# Editor example

An example plugin that adds to the code editor: extensions, a language and context menu items.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/plugin-example-editor <script>`.

`build` bundles `src/main.ts` into `bundle/main.js`, the plugin's main module.

## Rules

- **Peer modules stay out of the bundle.** `vite.config.ts` externalizes `PEER_MODULES`, which Elsewise provides at
  runtime. Declare the ones the plugin imports as peer dependencies.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
