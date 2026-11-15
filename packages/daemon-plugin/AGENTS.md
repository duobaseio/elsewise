# Daemon plugin

The contract between the daemon and a plugin's daemon part: what the part's main module exports, and what the daemon
provides it when enabling it. The daemon implements the contract; plugins build against it.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/daemon-plugin <script>`.

This is a **source package**: `exports` points straight at `src/` and there is no build step.

## Rules

- **`@elsewise/plugin` is the only dependency.**
- **Types only, and runtime values only if a second copy is harmless.** Node has no import map, so a plugin that
  imports this package at runtime inlines its own copy. Anything with identity reaches a plugin through the daemon's
  API, never through an import.
- **Relative imports only**, without extensions. No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
