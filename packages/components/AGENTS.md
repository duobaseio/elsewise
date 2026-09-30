# Components

The interface's components and the design tokens they draw with: shadcn components over Base UI primitives, React 19,
Tailwind v4. `DESIGN.md` at the repo root is the design system; this package is its implementation.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/components <script>`.

## Layout

| Path               | What it is                                                                               |
|--------------------|------------------------------------------------------------------------------------------|
| `src/components/`  | One component per file, flat. Consumers import `@elsewise/components/components/<name>`. |
| `src/lib/`         | Helpers. `utils.ts` is `cn()` (clsx + tailwind-merge).                                   |
| `src/styles.css`   | The Tailwind entry and the structure: token mapping, type scale, radius, base layer.     |
| `src/elsewise.css` | The default theme's values, and nothing else. Plain CSS.                                 |
| `test/`            | Shared harness — `sheet.tsx` (Sheet + CDP helpers), `browser-setup.ts`, `visual.css`.    |
| `test/visual/`     | Screenshot sheets plus their `__screenshots__/` baselines.                               |

This is a **source package**: `exports` points straight at `src/` and there is no build step — workspace consumers
(Vite, vitest) compile it themselves.

## Components stay pure

A component takes what it needs as **props**. It never reads settings, the bridge, `window.platform` or a hook over
any of them — the app owns that wiring and passes values down. This is what lets a sheet render a component with plain
props, and a settings page preview an unsaved value.

## Imports

**Relative only.** A source package compiles under its consumer's config, where `@/` is the *consumer's* `src`, so an
alias here resolves to the wrong tree. Nor does the package import itself by name: `./button`, `../lib/utils`.

## Styling

`styles.css` is the one stylesheet a consumer imports, at top level, **instead of** `tailwindcss` — it is the Tailwind
entry. Its `@source` names this package's classes, because Tailwind only scans the consumer's Vite root.

The two files split by what a theme may change. Everything in `elsewise.css` is a value a theme overrides; everything
in `styles.css` is structure no theme touches. Themes are color-only, so `--radius` lives in `styles.css`. A new token
gets its value in `elsewise.css`, light and dark, and its utility mapping in `styles.css`.

Reach for a token over a raw value; a missing token is a `DESIGN.md` question first. Upstream defaults that survive
generation — an inherited `md:text-sm`, a hardcoded palette class — are drift, not decisions.

## Adding a component

Components come from the shadcn CLI (`base-nova` over Base UI, Phosphor icons, per `components.json`), run from this
folder. Preview with `--dry-run` first.

```sh
pnpm dlx shadcn@4.21.0 add <name>
```

The CLI writes imports through the package's own name, which does not resolve here. After each `add`:

1. Rewrite `@elsewise/components/lib/utils` to `../lib/utils`, and `@elsewise/components/components/<x>` to `./<x>`.
2. Review any edit it made to `src/styles.css`, and move values it added to `elsewise.css`.
3. `pnpm --filter @elsewise/components check --write`.

## Comments

`//` for normal comments, one marker per line; `/** … */` only for doc comments; `/* … */` only where a comment has to
sit inside an expression, and in CSS. Prose wrapped at 120 columns by hand — Biome reflows code but never a comment.
Keep comments in test files to a minimum.

## Tests

Three Vitest **projects**, all declared in `vitest.config.ts`.

| Command             | Project   | What runs                                           |
|---------------------|-----------|-----------------------------------------------------|
| `pnpm test`         | `node`    | `{src,test}/**/*.test.{ts,tsx}`, plain Node, no DOM |
| `pnpm test:browser` | `browser` | `src/**/*.browser.test.{ts,tsx}`, headless Chromium |
| `pnpm test:visual`  | `visual`  | `test/visual/**`, headless Chromium                 |
| `pnpm test:all`     | all three | everything; needs a browser installed               |

**Co-locate a test with the module it covers,** and carry the runtime in the filename: `*.browser.test.tsx` needs a
layout engine, anything else under `src/` runs in Node. Node cannot paint or lay out, so anything measuring geometry or
reading a computed style belongs in `browser`; anything comparing pixels belongs in `visual`.

**Screenshot sheets stay in `test/visual/`.** Their scope is the design system rather than any one module, and their
baselines are binary blobs that do not belong in `src/`.

The first browser run on a cold cache can fail from a mid-run dependency re-optimize. Rerun before reading a failure.

### Visual tests

Baselines are **byte-exact** (`threshold: 0`), blessed on macOS, and committed. When one flakes, fix the environment,
not the comparator: a tolerance wide enough to absorb drift hides the 1px translate `:active` applies.

Dependency versions are **pinned exactly** for the same reason. A newer Chromium, font or Tailwind can move a pixel, so
a version bump is a change to review against the baselines, not a routine update. `vitest`, `@vitest/browser` and
`@vitest/browser-playwright` share one version.

`pnpm test:visual:update` reblesses every baseline the run touched, so scope it to a file and read the diff.

**The path goes before the flag.** `--update` takes an optional value, so a path after it is swallowed as that value
and the run reblesses everything, looking scoped. Same trap with `-u`.

```sh
pnpm vitest run --project visual test/visual/<file> --update   # 1 file
pnpm vitest run --project visual --update test/visual/<file>   # every file, silently
```

New sheets follow `test/visual/button.test.tsx`:

- **One image per theme, not per cell** — a matrix inside `<Sheet theme>`, captured via `getByTestId('sheet')`.
- **Two sheets per component** — prop-reachable states (`disabled`, `aria-invalid`) in one; `:hover`,
  `:focus-visible` and `:active` in another, forced through CDP via `forcePseudoStates`.
- **Pad cells that paint outside their box** — a screenshot clips to the bounding box, cropping an `outline-offset-2`
  ring.
- Module-scope constants are `SCREAMING_CASE` with `as const`; tables inside a test body stay `camelCase`.
