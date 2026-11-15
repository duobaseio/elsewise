# Status example

A toy plugin that adds statuses to workspaces, as an agent would, using
[`@elsewise/frontend-plugin`](../../../packages/frontend-plugin).

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/plugin-example-status build      # also: typecheck, check
```

## Trying it

1. Build the plugin, and add it to the plugins installed on this machine:

   ```bash
   pnpm --filter @elsewise/plugin-example-status build
   cd plugins/examples/status
   node ../../../apps/desktop/scripts/plugin.mjs add dist
   ```

2. Run Elsewise, e.g. `pnpm --filter @elsewise/web dev` and `pnpm --filter @elsewise/desktop dev`.

3. Right-click a workspace in the sidebar, and choose a status under Set status. Showing a workspace resets its
   complete agents, so set partial and complete on workspaces other than the one shown.

To remove the plugin, run `plugin.mjs remove io.duobase.elsewise.examples.status` from the same folder.
