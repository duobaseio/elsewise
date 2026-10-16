# Language server example

A plugin that adds TypeScript's language server to the code editor using [`@elsewise/plugin`](../../../packages/plugin):
diagnostics, completion, hover, signature help, go to definition, find usages, rename, formatting and code actions in
TypeScript and JavaScript files. A refactor that makes up a name, e.g. extracting a constant, starts renaming it, through
a handler for the server's `_typescript.rename` request. Completing a function or method adds its parentheses and opens
parameter info inside them, through `completionItems` and a handler for the `editor.action.triggerParameterHints`
command.

The plugin runs in Elsewise's renderer, which can't start processes. Instead, `serve` runs the server,
[`typescript-language-server`](https://github.com/typescript-language-server/typescript-language-server) on TypeScript
6's `tsserver`, behind a WebSocket on `ws://127.0.0.1:7300`, and the plugin connects to it.

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
   node ../../../apps/desktop/scripts/plugin.mjs add
   ```

   `add` takes the plugin's id from `manifest.json`, and links the bundle, so a rebuild needs no second `add`, but a
   change to the manifest does.

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
