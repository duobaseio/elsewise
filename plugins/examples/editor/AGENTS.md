# Editor example

An example plugin that adds to the code editor: extensions, a language with a preview in its settings, and context
menu items.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/plugin-example-editor <script>`.

`build` bundles `src/main.ts` into `dist/frontend/main.js`, the plugin's main module, and copies `public/` into
`dist/frontend/`:
`public/themes/<id>.json` is a theme of the plugin, as `public/keymaps/<id>.json` would be a keymap.

## Rules

- **Peer modules stay out of the bundle.** `vite.config.ts` externalizes the `PEER_MODULES`, which Elsewise provides at
  runtime. Declare the ones the plugin imports as peer dependencies.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
