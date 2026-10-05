# Editor example

A toy plugin that modifies the code editor using [`@elsewise/plugin`](../../../packages/plugin).

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/plugin-example-editor build      # also: typecheck, check
```

`build` bundles the plugin into `bundle/main.js`. The modules that Elsewise shares with its plugins, e.g. CodeMirror,
are left out of the bundle.

## Trying it

1. Build the plugin.
2. Copy `bundle/` to `<data folder>/plugins/io.duobase.elsewise.examples.editor/bundle/`.
3. Add the plugin to `<data folder>/plugins.json`:

   ```json
   [
     {
       "id": "io.duobase.elsewise.examples.editor",
       "name": "Editor example",
       "version": "1.0.0",
       "url": "app://elsewise/plugins/io.duobase.elsewise.examples.editor/bundle/main.js",
       "enabled": true
     }
   ]
   ```

4. Restart Elsewise.

The data folder is:

| OS      | Path                                                    |
|---------|---------------------------------------------------------|
| macOS   | `~/Library/Application Support/com.duobase.elsewise`    |
| Windows | `%LOCALAPPDATA%\duobase\elsewise\data`                  |
| Linux   | `$XDG_DATA_HOME/elsewise`, or `~/.local/share/elsewise` |
