# Editor example

A toy plugin that adds to the code editor, e.g. completions and a color picker, using
[`@elsewise/plugin`](../../../packages/plugin).

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/plugin-example-editor build      # also: typecheck, check
```

`build` bundles the plugin into `bundle/main.js`. The modules that Elsewise shares with its plugins, e.g. CodeMirror,
are left out of the bundle.

## Trying it

1. Build the plugin, and add it to the plugins installed on this machine:

   ```bash
   pnpm --filter @elsewise/plugin-example-editor build
   cd plugins/examples/editor
   node ../../../apps/desktop/scripts/plugin.mjs add
   ```

   `add` takes the plugin's id from `manifest.json`, and links the bundle, so a rebuild needs no second `add`, but a
   change to the manifest does.

2. Run Elsewise, e.g. `pnpm --filter @elsewise/web dev` and `pnpm --filter @elsewise/desktop dev`. Its editor shows
   `apps/web/src/routes/_shell/$project/$worktree.tsx` until it can open files.

3. Type e.g. `:sh` in any file, or start a key in a `.env` file, to see the plugin's completions.

To remove the plugin, run `plugin.mjs remove io.duobase.elsewise.examples.editor` from the same folder.
