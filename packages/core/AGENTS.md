# Core

Node-side code shared by every Elsewise process, today the desktop app and the daemon. It currently holds where
Elsewise keeps its files on disk and how it writes them, so both agree on one location.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/core <script>`.

This is a **source package**: `exports` points straight at `src/index.ts` and there is no build step.

## Rules

- **Node only.** Never import it from the renderer or a plugin; `apps/web` reaches the disk through
  `@elsewise/bridge`.
- **No embedder's dependencies**, such as `electron`; the daemon runs without it.
- **Relative imports only.** No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
