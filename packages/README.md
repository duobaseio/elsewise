# Packages

Shared Elsewise libraries.

| Package                                 | Path            | What it is                                          |
|-----------------------------------------|-----------------|-----------------------------------------------------|
| [`@elsewise/api`](./api)                | `api/`          | The contract between Elsewise and its plugins       |
| [`@elsewise/bridge`](./bridge)          | `bridge/`       | The contract between the UI and its embedder        |
| [`@elsewise/components`](./components)  | `components/`   | Primitive UI components and design system           |
| [`@elsewise/transport`](./transport/ts) | `transport/ts/` | The transport protocol implementation in TypeScript |

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/api typecheck         # also: check
pnpm --filter @elsewise/bridge typecheck      # also: check
pnpm --filter @elsewise/components test       # also: typecheck, check, test:browser, test:visual
pnpm --filter @elsewise/transport test        # also: typecheck, check, generate
```
