# Language server example

An example plugin that adds TypeScript's language server to the code editor, connecting to it over a WebSocket.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/plugin-example-language-server <script>`.

`build` bundles `src/main.ts` into `bundle/main.js`, the plugin's main module. `serve` runs `scripts/serve.mjs`, which
serves `tsc --lsp` on `ws://127.0.0.1:7300`. The plugin runs in the renderer, which can't start processes.

## Rules

- **Peer modules stay out of the bundle.** `vite.config.ts` externalizes `PEER_MODULES`, which Elsewise provides at
  runtime. Declare the ones the plugin imports as peer dependencies.
- **The port and origins match.** `src/main.ts` and `scripts/serve.mjs` share the port, and `serve.mjs` only accepts
  Elsewise's origins.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
