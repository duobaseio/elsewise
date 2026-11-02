# Editor example

A toy plugin that adds to the code editor, e.g. completions, a color picker and a hover section, and a theme, using
[`@elsewise/frontend-plugin`](../../../packages/frontend-plugin).

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/plugin-example-editor build      # also: typecheck, check
```

`build` bundles the plugin into `dist/frontend/main.js`, and copies `public/` into `dist/frontend/`. The modules that
Elsewise shares with its plugins, e.g. CodeMirror, are left out of the bundle.

## Trying it

1. Build the plugin, and add it to the plugins installed on this machine:

   ```bash
   pnpm --filter @elsewise/plugin-example-editor build
   cd plugins/examples/editor
   node ../../../apps/desktop/scripts/plugin.mjs add
   ```

   `add` takes the plugin's id from `manifest.json`, and links `dist/frontend`, so a rebuild needs no second `add`, but a
   change to the manifest does.

2. Run Elsewise, e.g. `pnpm --filter @elsewise/web dev` and `pnpm --filter @elsewise/desktop dev`. Its editor shows
   `apps/web/src/routes/_shell/$project/$worktree.tsx` until it can open files.

3. Type e.g. `:sh` in any file, or start a key in a `.env` file, to see the plugin's completions. Hover a hex color,
   e.g. `#1c2430`, to see a larger swatch with its RGB value.

4. In Settings › Appearance, pick Dusk under Editor example to use the plugin's theme.

## Themes and keymaps

A plugin's themes and keymaps are JSON files in its frontend part, which Elsewise reads without running the plugin:
`frontend/themes/<id>.json` and `frontend/keymaps/<id>.json`, each identified by its file name. Vite copies `public/`
into `dist/frontend/` as is, so this plugin keeps its theme in `public/themes/dusk.json`.

To remove the plugin, run `plugin.mjs remove io.duobase.elsewise.examples.editor` from the same folder.
