# Components

The interface's components and the design tokens they draw with: shadcn components over Base UI primitives, React 19,
Tailwind v4. `DESIGN.md` at the repo root is the design system; this package is its implementation.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/components <script>`.

## Layout

| Path               | What it is                                                                               |
|--------------------|------------------------------------------------------------------------------------------|
| `src/components/`  | One component per file, flat. Consumers import `@elsewise/components/components/<name>`. |
| `src/lib/`         | Helpers. `utils.ts` is `cn()` (clsx + tailwind-merge). `file-icons.gen.ts` is generated. |
| `src/assets/`      | `file-icons/`: the vendored file-icon SVGs. Generated.                                   |
| `src/styles.css`   | The Tailwind entry and the structure: token mapping, type scale, radius, base layer.     |
| `src/elsewise.css` | The default theme's values, and nothing else. Plain CSS.                                 |
| `test/`            | Shared harness — `sheet.tsx` (Sheet + CDP helpers), `browser-setup.ts`, and              |
|                    | `visual-setup.ts`, which adds `visual.css` for the `visual` project alone.               |
| `test/visual/`     | Screenshot sheets plus their `__screenshots__/` baselines.                               |

This is a **source package**: `exports` points straight at `src/` and there is no build step — workspace consumers
(Vite, vitest) compile it themselves.

## Generated code

`src/lib/file-icons.gen.ts` and `src/assets/file-icons/` are written by `tools/` (`dart run
bin/file-icons/emit_typescript_icons.dart`, from `tools/assets/languages.json`) and committed. Never hand-edit; Biome
excludes both. The map, the tints and how to add a language are in `tools/AGENTS.md`. `file-icons.gen.test.ts` pins
that every vendored import ends `?no-inline`, so the artwork is fetched on use rather than inlined into the initial
chunk, and that there is one import per vendored file.

## Components stay pure

A component takes what it needs as **props**. It never reads settings, the bridge, `window.platform` or a hook over
any of them — the app owns that wiring and passes values down.

## Icons

A component never imports `@phosphor-icons/react`; it draws `<Icon name="check" />` from `./icon`. `icon.tsx` maps each
**role** — `check`, `close`, `expand` — to its default Phosphor icon, and the app replaces any of them through
`IconProvider`. Name a role for what the icon does, not what it looks like, and add one to `DEFAULT_ICONS` when none
fits. Biome enforces the import ban everywhere but `icon.tsx`, `file-icon.tsx` and `test/` — a test co-located in
`src/` is still bound by it.

File icons are separate: `<FileIcon name="main.ts" />` resolves a filename against the generated tables, and the app
replaces entries by exact filename or by extension, and the fallback for a name matching neither, through
`FileIconProvider`.

## Imports

**Relative only.** A source package compiles under its consumer's config, where `@/` is the *consumer's* `src`, so an
alias here resolves to the wrong tree. Nor does the package import itself by name: `./button`, `../lib/utils`.

**React by name.** `import { type ComponentProps, useState } from 'react'`, never the `React.` namespace — neither
`import * as React` nor the global one `@types/react` declares, which resolves with no import at all.

## Styling

`styles.css` is the one stylesheet a consumer imports, at top level, **instead of** `tailwindcss`.

The two files split by what a theme may change. Everything in `elsewise.css` is a value a theme overrides; everything
in `styles.css` is structure no theme touches. Themes are color-only, so `--radius` lives in `styles.css`. A new token
gets its value in `elsewise.css`, light and dark, and its utility mapping in `styles.css`.

Reach for a token over a raw value.

## Adding a component

Components come from the shadcn CLI (`base-nova` over Base UI, Phosphor icons, per `components.json`), run from this
folder. Preview with `--dry-run` first.

```sh
pnpm dlx shadcn@4.21.0 add <name>
```

The CLI writes imports through the package's own name, which does not resolve here. After each `add`:

1. Rewrite `@elsewise/components/lib/utils` to `../lib/utils`, and `@elsewise/components/components/<x>` to `./<x>`.
2. Replace `import * as React` and every `React.X` with named imports from `react`.
3. Replace each Phosphor icon with `<Icon name="…" />`, adding a role to `icon.tsx` if none fits.
4. Review any edit it made to `src/styles.css`, and move values it added to `elsewise.css`.
5. `pnpm --filter @elsewise/components check --write`.

## Comments

`//` for normal comments, one marker per line; `/** … */` only for doc comments; `/* … */` only where a comment has
to sit inside an expression, and in CSS. Prose wrapped at 120 columns by hand — Biome reflows code but never a
comment. Keep comments in test files to a minimum.

## Tests

Three Vitest **projects**, all declared in `vitest.config.ts`. Each script runs as
`pnpm --filter @elsewise/components <script>`.

| Script         | Project   | What runs                                           |
|----------------|-----------|-----------------------------------------------------|
| `test`         | `node`    | `{src,test}/**/*.test.{ts,tsx}`, plain Node, no DOM |
| `test:browser` | `browser` | `src/**/*.browser.test.{ts,tsx}`, headless Chromium |
| `test:visual`  | `visual`  | `test/visual/**`, headless Chromium                 |
| `test:all`     | all three | everything; needs a browser installed               |

**Co-locate a test with the module it covers,** and carry the runtime in the filename: `*.browser.test.tsx` needs a
layout engine, anything else under `src/` runs in Node. Node cannot paint or lay out, so anything measuring geometry or
reading a computed style belongs in `browser`; anything comparing pixels belongs in `visual`.

**Screenshot sheets stay in `test/visual/`.** Their scope is the design system rather than any one module, and their
baselines are binary blobs that do not belong in `src/`.

A dependency discovered mid-run makes Vite re-optimize and reload, which fails whichever file was loading — only on a
cold cache, so it passes on rerun. `optimizeDeps.include` in `vitest.config.ts` names everything the components import
to prevent it; a component that brings a new dependency adds it there too.

### Visual tests

Baselines are **byte-exact** (`threshold: 0`), blessed on macOS, and committed. When one flakes, fix the environment,
not the comparator: a tolerance wide enough to absorb drift hides the 1px translate `:active` applies.

Dependency versions are **pinned exactly** for the same reason. A newer Chromium, font or Tailwind can move a pixel, so
a version bump is a change to review against the baselines, not a routine update. `vitest`, `@vitest/browser` and
`@vitest/browser-playwright` share one version.

`test:visual:update` reblesses every baseline the run touched, so scope it to a file and read the diff.

**The path goes before the flag.** `--update` takes an optional value, so a path after it is swallowed as that value
and the run reblesses everything, looking scoped. Same trap with `-u`.

```sh
# 1 file
pnpm --filter @elsewise/components exec vitest run --project visual test/visual/<file> --update
# every file, silently
pnpm --filter @elsewise/components exec vitest run --project visual --update test/visual/<file>
```

New sheets follow `test/visual/button.test.tsx`:

- **One image per theme, not per cell** — a matrix inside `<Sheet theme>`, captured via `getByTestId('sheet')`.
- **Two sheets per component** — prop-reachable states (`disabled`, `aria-invalid`) in one; `:hover`,
  `:focus-visible` and `:active` in another, forced through CDP via `forcePseudoStates`.
- **Pad cells that paint outside their box** — a screenshot clips to the bounding box, cropping an `outline-offset-2`
  ring.
- Module-scope constants are `SCREAMING_CASE` with `as const`; tables inside a test body stay `camelCase`.
