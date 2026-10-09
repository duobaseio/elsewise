# Language server example

A plugin that adds TypeScript's language server to the code editor using [`@elsewise/plugin`](../../../packages/plugin):
diagnostics, completion, hover, signature help, go to definition, rename and formatting in TypeScript and JavaScript
files.

The plugin runs in Elsewise's renderer, which can't start processes. Instead, `serve` runs the server, `tsc --lsp` from
TypeScript 7, behind a WebSocket on `ws://127.0.0.1:7300`, and the plugin connects to it.

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/plugin-example-language-server build      # also: serve, typecheck, check
```

`build` bundles the plugin into `bundle/main.js`.

## Trying it

1. Build the plugin, and add it to the plugins installed on this machine:

   ```bash
   pnpm --filter @elsewise/plugin-example-language-server build
   cd plugins/examples/language-server
   node ../../../apps/desktop/scripts/plugin.mjs add io.duobase.elsewise.examples.language-server "Language server example"
   ```

2. Serve the language server, and leave it running:

   ```bash
   pnpm --filter @elsewise/plugin-example-language-server serve
   ```

3. Run Elsewise, e.g. `pnpm --filter @elsewise/web dev` and `pnpm --filter @elsewise/desktop dev`. Its editor shows
   `apps/web/src/routes/_shell/$project/$worktree.tsx` until it can open files.

To see how Elsewise shows what a server reports, type these into the terminal running `serve`. They apply to every
connection:

- `message <error|warning|info> <text>` sends the message, e.g. `message warning Indexing is slow`.
- `fail [method]` answers the next request, or the next one for `method`, with an error, e.g. `fail
  textDocument/definition` and then F12.

Stopping `serve` while Elsewise runs shows that the server stopped; running Elsewise without it shows that it failed to
start.

`serve` logs each server it starts and stops. To remove the plugin, run `plugin.mjs remove
io.duobase.elsewise.examples.language-server` from the same folder.
