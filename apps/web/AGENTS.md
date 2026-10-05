# Web

The Elsewise UI: a React 19 + TanStack Router SPA on Vite 8 and Tailwind v4. Runs standalone on `:3000` and doubles as
the desktop's renderer, which loads the dev server, or the `build` output over `app://` in production.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/web <script>`.

## Rules

- **Use `@/`** to reach `src/`.
- **The embedder through `window.bridge`.** Types come from `@elsewise/bridge`; every surface may be undefined, as in
  a plain browser.
- **Never hand-edit `routeTree.gen.ts`.**
- **Node only in `vite.config.ts`, `vitest.config.ts` and `vite/`.** `tsconfig.node.json` gives them Node's types;
  `tsconfig.app.json` keeps them out of `src/`.
- **Tests sit beside their source** as `src/**/*.test.ts` and run in Node on Vitest: `test`. Group them in a `describe`
  per function under test, and name each test for what that function does, without repeating its name.
- **Geometry or computed styles need `src/**/*.browser.test.tsx`**, beside their source: `test:browser`. **Pixels
  belong in `test/visual/`**: `test:visual`. Both run in headless Chromium and follow the components' tests, whose
  baselines are likewise byte-exact and blessed on macOS; see `packages/components/AGENTS.md`. A test that brings a new
  dependency adds it to `optimizeDeps.include` in `vitest.config.ts`. `test:all` runs every project.
- **Comments**: `//` for comments, `/** … */` for doc comments. Wrap prose at 120 columns by hand.
