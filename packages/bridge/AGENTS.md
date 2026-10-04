# Bridge

The contract between the Elsewise UI and its embedder: what an embedder provides beyond the web platform, on
`window.bridge`. Today the one embedder is the Electron app; the contract assumes none in particular.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/bridge <script>`.

## Layout

| Path              | What it is                                                                         |
|-------------------|------------------------------------------------------------------------------------|
| `src/index.ts`    | The public surface; consumers import `@elsewise/bridge`. Declares `window.bridge`. |
| `src/plugins.ts`  | `PluginsBridge`, the plugins installed on this machine: `window.bridge.plugins`.   |
| `src/settings.ts` | `SettingsBridge`, the app's and plugins' settings, and the `Settings` model.       |
| `src/window.ts`   | `WindowBridge`, the native window: `window.bridge.window`.                         |

This is a **source package**: `exports` points straight at `src/index.ts` and there is no build step.

## Rules

- **Contract only.** No implementation and no embedder's dependencies, such as `electron`; each embedder implements
  the contract its own way.
- **Relative imports only.** No aliases.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
