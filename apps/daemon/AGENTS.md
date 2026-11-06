# Daemon

The Elsewise daemon: a plain Node process that serves the `elsewise.daemon.*` services over `@elsewise/transport`.
Today it listens for WebSocket clients on loopback; a later topology has it dial out to a backend instead, so nothing
outside `websocket.ts` may assume the daemon is the server.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/daemon <script>`.

## Layout

| Path                         | What it is                                                                              |
|------------------------------|-----------------------------------------------------------------------------------------|
| `src/main.ts`                | The entry point: reads the environment, builds the daemon, listens, closes on a signal. |
| `src/daemon.ts`              | The composition root: `createDaemon` builds what the services share and registers them. |
| `src/websocket.ts`           | The WebSocket server: one `Channel` per connection, token checked before the upgrade.   |
| `src/directory-watcher.ts`   | The directory watcher the services share: one recursive subscription per watched root.  |
| `src/directories.ts`         | The data directory, `elsewise.db`, and the code directory, `workspaces/<project>/`.     |
| `src/plugins/`               | The plugin store: reads `plugins/` and `plugins.json` in the data directory, runs them. |
| `src/database/`              | The SQLite database: a Kysely dialect over `node:sqlite`, migrations, `openDatabase`.   |
| `src/<feature>/`             | One folder per service: its `ServiceImpl` in `service.ts`, beside what it is built on.  |
| `src/gen/`                   | Generated code, gitignored; `pnpm generate` rebuilds it. See below.                     |
| `src/**/*.test.ts`           | A module's direct tests, beside it: plain Vitest, no daemon started.                    |
| `test/**/*.e2e.test.ts`      | Suites that start a daemon and call it through a real client, grouped like `src/`.      |
| `database/`                  | `schema.sql`, the schema as it should be; `migrations/`, how to get there; `atlas.hcl`. |
| `scripts/build.mjs`          | Bundles the daemon into `dist/`, for the platform the build runs on.                    |
| `scripts/codegen.ts`         | Embeds the migrations and writes the Kysely types; part of `pnpm generate`.             |
| `scripts/migration-check.ts` | Fails unless the migrations add up to `schema.sql`; `pnpm migration:check`.             |

## Wiring

No DI framework. A service is a class that takes what it depends on in its constructor, and `createDaemon` is the
only place that constructs anything. Adding a service means a proto under `proto/elsewise/daemon/`, a folder
under `src/`, and one `serve` line in `daemon.ts`.

## Connecting

`main.ts` prints one JSON line to stdout, `{"port":…,"token":…}`, and nothing else ever goes there: whoever spawned
the daemon reads it to learn where to connect. Logs go to stderr.

| Variable                | What it sets                                                                 |
|-------------------------|------------------------------------------------------------------------------|
| `ELSEWISE_DAEMON_PORT`  | The loopback port. Unset or `0` picks a free one.                            |
| `ELSEWISE_DAEMON_TOKEN` | The token a client must offer. Unset generates a random one per start.       |
| `ELSEWISE_DAEMON_DATA`  | The data directory. Unset uses `daemonDataDir()` from `@elsewise/core/node`. |
| `ELSEWISE_DAEMON_CODE`  | Where new projects and workspaces go. Unset uses `projectDir()` from core.   |

A client offers two WebSocket subprotocols, the one header a browser's `WebSocket` can set: `elsewise.daemon.v1`,
and `elsewise.daemon.token.<token>` with the token as printed. The daemon refuses the upgrade without both and
selects `elsewise.daemon.v1`, so the token is never echoed. The token goes into a subprotocol name untransformed, so
it may only contain letters, digits, `_` and `-`; the daemon refuses to start with any other. The daemon mints even
stream ids, so a client's channel keeps the default odd parity.

## Bundling

`pnpm build` bundles everything, dependencies included, into `dist/daemon.mjs`. The two native addons are copied
beside it for the platform the build runs on, so the daemon ships as one bundle per operating system and
architecture: the `@parcel/watcher` binary as `dist/watcher.node`, and the `@lydell/node-pty` binary as `dist/pty.node`
(`dist/conpty.node` on Windows) with the files node-pty loads by path, `spawn-helper` on macOS and the conout worker
on Windows. Keep every other dependency pure JavaScript: the build script has to name each native binary itself.

## Terminals

A terminal is a row of the `terminal` table; its shell is a process the daemon runs for it, started by the first
`AttachTerminal` and never by `CreateTerminal`. `src/terminal/shell.ts` pairs the pseudoterminal (`@lydell/node-pty`)
with a headless xterm (`@xterm/headless`) that keeps the buffer, so an attaching client gets the shell's size, the
number of clients, one serialized snapshot (`@xterm/addon-serialize`) and then the live output. Every client is told of
a resize and of a client attaching or detaching. `src/terminal/shells.ts` is the registry the service builds over them:
it saves a running shell's buffer to the row shortly after each output and on exit. The service's `killWorkspace` is
what the project service calls before deleting a workspace, and its `close` is what the daemon's close awaits before the
database. A shell that the daemon's own close kills leaves no exit on the row, so after a restart the terminal is
`stopped` and the next attach writes a `daemon restarted` marker between the old buffer and the new shell.

## Imports

No aliases. Every import inside the package is relative, including tests reaching back into `src/`.

## Ordering

Exported declarations come first in a file, and the private helpers they call go below them. In a class, `#private`
members go after the public ones.

## Database

One SQLite file, `elsewise.db` in the data directory, read through Kysely. `database/schema.sql` is the schema as it
should be and is edited by hand; `database/migrations/` is how a database gets there and is written by Atlas:

```sh
pnpm --filter @elsewise/daemon migration v0_2_0     # after editing schema.sql; then `pnpm generate` to embed it
pnpm --filter @elsewise/daemon migration:check      # fails unless the migrations add up to schema.sql
```

A migration is named after the daemon version that ships it, `v<major>_<minor>_<patch>`; Atlas prefixes a timestamp it
needs for ordering, so the file is `<timestamp>_v0_2_0.sql`. Never edit a migration that is on `main`; add the next one.
The daemon applies the migrations itself at start-up (`src/database/migrate.ts`, recording them in
`schema_revision`), so Atlas is a development tool only and the bundle never needs it.

Queries live in a feature's `store.ts` and are typed against `src/gen/database.ts`. Tests open `:memory:` databases;
there is nothing to run in a container.

## Generated code

Never hand-edit; Biome excludes `src/gen/`. `prepare` regenerates on install. `pnpm generate` runs two generators:
`buf generate` for the protobuf-es bindings, and `scripts/codegen.ts`, which embeds `database/migrations/*.sql` into
`src/gen/migrations.ts` (the bundle ships no loose files) and runs kysely-codegen over a migrated in-memory database
into `src/gen/database.ts`.

## Comments

Same conventions as `apps/web/`: `//` for normal comments, `/** … */` only for doc comments, prose wrapped at 120
columns by hand. Keep comments in test files to a minimum.
