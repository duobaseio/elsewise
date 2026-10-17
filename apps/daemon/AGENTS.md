# Daemon

The Elsewise daemon: a plain Node process that serves the `elsewise.daemon.*` services over `@elsewise/transport`.
Today it listens for WebSocket clients on loopback; a later topology has it dial out to a backend instead, so nothing
outside `websocket.ts` may assume the daemon is the server.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/daemon <script>`.

## Layout

| Path                       | What it is                                                                              |
|----------------------------|-----------------------------------------------------------------------------------------|
| `src/main.ts`              | The entry point: reads the environment, builds the daemon, listens, closes on a signal. |
| `src/daemon.ts`            | The composition root: `createDaemon` builds what the services share and registers them. |
| `src/websocket.ts`         | The WebSocket server: one `Channel` per connection, token checked before the upgrade.   |
| `src/directory-watcher.ts` | The directory watcher the services share: one recursive subscription per watched root.  |
| `src/<feature>/`           | One folder per service: its `ServiceImpl` in `service.ts`, beside what it is built on.  |
| `src/gen/`                 | protobuf-es output for `proto/elsewise/daemon/`; gitignored, `pnpm generate` rebuilds.  |
| `src/**/*.test.ts`         | A module's direct tests, beside it: plain Vitest, no daemon started.                    |
| `test/**/*.e2e.test.ts`    | Suites that start a daemon and call it through a real client, grouped like `src/`.      |
| `scripts/build.mjs`        | Bundles the daemon into `dist/`, for the platform the build runs on.                    |

## Wiring

No DI framework. A service is a class that takes what it depends on in its constructor, and `createDaemon` is the
only place that constructs anything. Adding a service means a proto under `proto/elsewise/daemon/`, a folder
under `src/`, and one `serve` line in `daemon.ts`.

## Connecting

`main.ts` prints one JSON line to stdout, `{"port":…,"token":…}`, and nothing else ever goes there: whoever spawned
the daemon reads it to learn where to connect. Logs go to stderr.

| Variable                | What it sets                                                           |
|-------------------------|------------------------------------------------------------------------|
| `ELSEWISE_DAEMON_PORT`  | The loopback port. Unset or `0` picks a free one.                      |
| `ELSEWISE_DAEMON_TOKEN` | The token a client must offer. Unset generates a random one per start. |

A client offers two WebSocket subprotocols, the one header a browser's `WebSocket` can set: `elsewise.daemon.v1`,
and `elsewise.daemon.token.<token>` with the token as printed. The daemon refuses the upgrade without both and
selects `elsewise.daemon.v1`, so the token is never echoed. The token goes into a subprotocol name untransformed, so
it may only contain letters, digits, `_` and `-`; the daemon refuses to start with any other. The daemon mints even
stream ids, so a client's channel keeps the default odd parity.

## Bundling

`pnpm build` bundles everything, dependencies included, into `dist/daemon.mjs`. The one native addon, the
`@parcel/watcher` binary, is copied beside it as `dist/watcher.node` for the platform the build runs on, so the
daemon ships as one bundle per operating system and architecture. Keep every other dependency pure JavaScript: the
build script has to name each native binary itself.

## Imports

No aliases. Every import inside the package is relative, including tests reaching back into `src/`.

## Generated code

Never hand-edit; Biome excludes `src/gen/`. `prepare` regenerates on install.

## Comments

Same conventions as `apps/web/`: `//` for normal comments, `/** … */` only for doc comments, prose wrapped at 120
columns by hand. Keep comments in test files to a minimum.
