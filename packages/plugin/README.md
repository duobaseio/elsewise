# Plugin

Types shared between a frontend and daemon parts of a plugin.

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/plugin test      # also: typecheck, check
```

This is a source package: `exports` points straight at `src/` and there is no build step.
