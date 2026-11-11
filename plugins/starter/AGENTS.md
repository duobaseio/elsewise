# Starter

A starter template for an Elsewise plugin, with a frontend part and a daemon part, which plugin authors copy. It is
its own pnpm workspace, fenced from the repo's: run pnpm from **this folder**, and run `pnpm install` here after the
repo's.

`frontend/` and `daemon/` are its packages. `build` bundles `frontend/src/main.ts` into `dist/frontend/main.js` and
`daemon/src/main.ts` into `dist/daemon/main.js`, the parts' main modules, copies `frontend/public/`, e.g. themes and
keymaps, into `dist/frontend/`, and runs `elsewise-plugin manifest`, which writes `manifest.json` into `dist/` with the
listing fields, `description`, `homepage`, `repository`, `issues`, `license` and `topics`, added from the root
`package.json`. `plugin.mjs add dist` installs it.

## Rules

- **`dist/` is the plugin as installed.** `manifest.json`, and a folder per part, laid out as in the data folder.
- **Peer modules stay out of the frontend bundle.** `frontend/vite.config.ts` externalizes the `PEER_MODULES`, which
  Elsewise provides at runtime. Declare the ones the part imports as peer dependencies, never as dependencies.
- **Everything goes into the daemon bundle.** The daemon provides no modules, so `daemon/vite.config.ts` is a server
  build with nothing external.
- **The contracts are linked**, `link:../../../packages/frontend-plugin` and `link:../../../packages/daemon-plugin`,
  so the starter builds against the source. `@elsewise/plugin` is linked at the root, for its `elsewise-plugin`
  command. Nothing else from the repo may be imported.
- **Listing fields are written once**, in the root `package.json`. One written in `manifest.json` wins. No made-up
  URLs: the template has no homepage, repository or issue tracker of its own.
- **Keep it minimal.** It shows the shape of a two-part plugin, not the API; the examples under `../examples` do that.
- **The README is for plugin authors.** Keep it in step with the build, the manifest and `plugin.mjs`.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
