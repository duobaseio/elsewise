# Daemon

The Elsewise daemon: a plain Node process that serves the `elsewise.daemon.v1` services over `@elsewise/transport`.
Today it listens for WebSocket clients on loopback; a later topology has it dial out to a backend instead, so nothing
outside `websocket.ts` may assume the daemon is the server.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/daemon <script>`.

## Layout

| Path                | What it is                                                                                   |
|---------------------|----------------------------------------------------------------------------------------------|
| `src/main.ts`       | The entry point: reads the environment, builds the daemon, listens, and closes on a signal.  |
| `src/daemon.ts`     | The composition root. `createDaemon` constructs what the services share and registers them.  |
| `src/websocket.ts`  | The WebSocket server: one `Channel` per connection, token checked before the upgrade.        |
| `src/<feature>/`    | One folder per service: its `ServiceImpl` class in `service.ts`, beside what it is built on. |
| `src/gen/`          | protobuf-es bindings for `proto/elsewise/daemon/`. Gitignored, rebuilt by `pnpm generate`.   |
| `test/`             | Vitest suites (plain Node), calling the daemon through a real client over loopback.          |
| `scripts/build.mjs` | Bundles the daemon into the one file `dist/daemon.mjs`.                                      |

## Wiring

No DI framework. A service is a class that takes what it depends on in its constructor, and `createDaemon` is the
only place that constructs anything. Adding a service means a proto under `proto/elsewise/daemon/v1/`, a folder
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

`pnpm build` bundles everything, dependencies included, into `dist/daemon.mjs`, so the daemon ships as one file that
any Node runs. Keep dependencies pure JavaScript: a native addon cannot go into the bundle.

## Imports

No aliases. Every import inside the package is relative, including tests reaching `../src`.

## Generated code

Never hand-edit; Biome excludes `src/gen/`. `prepare` regenerates on install.

## Comments

Same conventions as `apps/web/`: `//` for normal comments, `/** … */` only for doc comments, prose wrapped at 120
columns by hand. Keep comments in test files to a minimum.
