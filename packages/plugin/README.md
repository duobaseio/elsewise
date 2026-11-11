# Plugin

Types shared between a frontend and daemon parts of a plugin.


## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/plugin test      # also: typecheck, check, build
```


## `elsewise-plugin`

The package has a command for a plugin's build, run from the plugin's folder:

```bash
elsewise-plugin manifest      # writes dist/manifest.json
```

`manifest` writes `manifest.json` into `dist/`, with the listing fields, `description`, `homepage`, `repository`,
`issues`, `license` and `topics`, added from `package.json`. A field written in `manifest.json` has priority over 
fields stated in `package.json`.
