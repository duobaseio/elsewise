# Core

Code shared by the frontend, desktop app and daemon. `@elsewise/core` has the plugin resolution logic, and
`@elsewise/core/node` has the Node-only code, such as where Elsewise keeps its files.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/core <script>`.

This is a **source package**: `exports` points straight at `src/` and there is no build step.

## Rules

- **`@elsewise/core` runs anywhere.** It runs in the renderer and in Node, so nothing from `node:`, the DOM or React.
- **`@elsewise/core/node` is Node only.** It lives in `src/node/`. Never import it from the renderer or a plugin;
  `apps/web` reaches the disk through `@elsewise/bridge`.
- **No embedder's dependencies**, such as `electron`; the daemon runs without it.
- **Not for plugins.** A plugin builds against `@elsewise/frontend-plugin` or `@elsewise/daemon-plugin`; this is the
  other side of that contract.
- **Relative imports only**, with `.ts` extensions. No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
