# Packages

Shared Elsewise libraries.

| Package                                          | Path               | What it is                                                   |
|--------------------------------------------------|--------------------|--------------------------------------------------------------|
| [`@elsewise/bridge`](./bridge)                   | `bridge/`          | The contract between the UI and its embedder                 |
| [`@elsewise/components`](./components)           | `components/`      | Primitive UI components and design system                    |
| [`@elsewise/core`](./core)                       | `core/`            | Node-side code shared by every Elsewise process              |
| [`@elsewise/frontend-plugin`](./frontend-plugin) | `frontend-plugin/` | The contract between the app and a plugin's frontend part    |
| [`@elsewise/plugin`](./plugin)                   | `plugin/`          | Types shared between a frontend and daemon parts of a plugin |
| [`@elsewise/transport`](./transport/ts)          | `transport/ts/`    | The transport protocol implementation in TypeScript          |

## Running scripts

Run pnpm from the repo root, filtered to the package:

```bash
pnpm --filter @elsewise/bridge typecheck      # also: check
pnpm --filter @elsewise/components test       # also: typecheck, check, test:browser, test:visual
pnpm --filter @elsewise/core typecheck        # also: check
pnpm --filter @elsewise/frontend-plugin test  # also: typecheck, check
pnpm --filter @elsewise/plugin test           # also: typecheck, check
pnpm --filter @elsewise/transport test        # also: typecheck, check, generate
```
