# Starter

A starter template for an Elsewise plugin. The plugin is divided into two parts: the frontend, which contains all the
UI and client-side logic, and the daemon, which contains the logic that runs next to the files, e.g. spawning language
servers.

| Path            |                                                               |
|-----------------|---------------------------------------------------------------|
| `manifest.json` | The plugin's metadata. See [Manifest](#manifest).             |
| `frontend/`     | The frontend part, built against `@elsewise/frontend-plugin`. |
| `daemon/`       | The daemon part, built against `@elsewise/daemon-plugin`.     |

## Manifest

`manifest.json` describes the plugin and its parts. A plugin has a frontend part, a daemon part, or both. The parts
share the plugin's id and version.

See [`Manifest`](../../packages/plugin/src/manifest.ts) in `@elsewise/plugin` for a detailed description.

## Frontend

A frontend part may contain themes and keymaps, with or without code. Without code, omit `main` in `manifest.json`.

### Themes

Themes modify Elsewise's appearance. They are individual JSON files in `frontend/public/themes/`, which `build` copies
into `dist/frontend/themes/`. A theme's file name is also its id, e.g. `dusk` for `dusk.json`.

See [`Theme`](../../packages/frontend-plugin/src/theme.ts) for a theme's schema.

### Keymaps

Keymaps change the keys that run Elsewise's commands. They are individual JSON files in `frontend/public/keymaps/`,
which `build` copies into `dist/frontend/keymaps/`. A keymap's file name is also its id, e.g. `eclipse` for
`eclipse.json`.

See [`Keymap`](../../packages/frontend-plugin/src/keymap.ts) for a keymap's schema.

## Running scripts

The starter is its own pnpm workspace, so run pnpm from this folder:

```bash
pnpm install
pnpm build          # also: typecheck, check
```

`build` bundles each part into `dist/`:

| Source                     | Output                   |
|----------------------------|--------------------------|
| `manifest.json`            | `dist/manifest.json`     |
| `frontend/src/main.ts`     | `dist/frontend/main.js`  |
| `frontend/public/themes/`  | `dist/frontend/themes/`  |
| `frontend/public/keymaps/` | `dist/frontend/keymaps/` |
| `daemon/src/main.ts`       | `dist/daemon/main.js`    |

Elsewise provides several modules, e.g. React, listed in [`PEER_MODULES`](../../packages/frontend-plugin/src/build.ts),
that a plugin's frontend can reuse. If you require those modules in your frontend part, declare them as
`peerDependencies`. Do **NOT** declare them as `dependencies` as that installs a copy of its own, which may cause
runtime issues.

### Existing pnpm workspace

To put the plugin in an existing pnpm workspace, delete its `pnpm-workspace.yaml` and `pnpm-lock.yaml`, and add the
plugin and its parts to the workspace's `pnpm-workspace.yaml`:

```yaml
packages:
  - plugins/my-plugin
  - plugins/my-plugin/frontend
  - plugins/my-plugin/daemon
```

Then run `pnpm install` from the workspace root. `pnpm build` from the plugin's folder still builds both parts, since
`pnpm -r` only runs in the packages under the current folder. Package names must be unique in a workspace, so rename
`starter`, `starter-frontend` and `starter-daemon`.

## Installing

Elsewise loads plugins from its data folder:

| Platform | Data folder                                                     |
|----------|-----------------------------------------------------------------|
| macOS    | `~/Library/Application Support/io.duobase.elsewise/data`        |
| Windows  | `%LOCALAPPDATA%\duobase\elsewise\data`                          |
| Linux    | `$XDG_DATA_HOME/elsewise`, by default `~/.local/share/elsewise` |

```
<data folder>/
├── frontend/
│   ├── plugins.json
│   └── plugins/
│       └── <plugin id>/
│           ├── manifest.json
│           └── frontend/
│               ├── main.js
│               ├── themes/
│               └── keymaps/
└── daemon/
    ├── plugins.json
    └── plugins/
        └── <plugin id>/
            ├── manifest.json
            └── daemon/
                └── main.js
```

`plugins.json` lists which plugins are enabled on that side.

### Hot-reloading plugins (WIP)

`plugin.mjs add` installs a plugin under development. It links the parts rather than copying them, so a rebuild needs
no second `add`, but a change to the manifest needs a rebuild and `add`:

```bash
pnpm build
node ../../apps/desktop/scripts/plugin.mjs add dist
```

Restart Elsewise and the daemon to load it. To remove it, run `plugin.mjs remove com.example.starter`.
