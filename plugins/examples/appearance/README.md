# Appearance example

A plugin without code: a theme, Dusk, in `frontend/themes/dusk.json`, and a keymap, Eclipse, in
`frontend/keymaps/eclipse.json`. There is nothing to build.

## Trying it

1. Add the plugin to the plugins installed on this machine:

   ```bash
   cd plugins/examples/appearance
   node ../../../apps/desktop/scripts/plugin.mjs add
   ```

   `add` takes the plugin's id from `manifest.json`, and links `frontend/`, so a change to a theme or keymap needs no
   second `add`, but a change to the manifest does.

2. Run Elsewise, e.g. `pnpm --filter @elsewise/web dev` and `pnpm --filter @elsewise/desktop dev`.

3. In Settings › Appearance, pick Dusk under Appearance example, and Eclipse under Keymap.

To remove the plugin, run `plugin.mjs remove io.duobase.elsewise.examples.appearance` from the same folder.
