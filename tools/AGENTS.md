# Tools

`elsewise_tool` — the Dart CLI behind the file icons. It resolves each language's tint, vendors the assets the map
actually uses into `packages/components/`, and emits the lookup tables `FileIcon` reads.

Run everything from this folder (`cd tools`).

## The map

`assets/languages.json` is the whole decision surface, hand-maintained: two sections, `extensions` (keys carry no
leading dot — `zig.zon`, not `.zig.zon`) and `names` (exact filenames, so a dot-file keeps its dot), each key carrying
one of four specs.

- **Monochrome mark** — `{"slug": "gnubash", "color": {"light": …, "dark": …}}`. The default: a Simple Icons
  glyph, painted in its tint.
- **Brand** — `{"devicon": "r-original"}`. For a mark that only reads in its own colors, so it carries no tint:
  it is shown, not painted.
- **Letterform** — `{"letterform": "MK", "color": {…}}`. Where no usable mark exists. One to three characters;
  `color` may be omitted, and the tile then takes the theme's ink.
- **Media kind** — `{"phosphor": "image"}`. Where the medium is the identity and no vendor owns it — pictures, GIFs.
  `color` is optional here, as it is for a letterform: with one the mark is painted in its tint, without one it takes
  the theme's ink. Omit it unless the language genuinely owns a color — the kind exists for the cases where it does not.

Both sections are sorted by key. A `color` must carry **both** themes — seed each with the brand hex and let
the emitter resolve them.

Source assets live beside the map, under `assets/file-icons/simple-icons/` and `assets/file-icons/dev-icons/`. A spec
may only name a file already sitting there; `emit_typescript_icons.dart` refuses to emit if one is missing, rather than
emitting a table that paints nothing. Downloading the file is part of adding the entry. It refuses a malformed spec the
same way — no kind or two, a `slug` without a `color`, a `devicon` with one, a `color` missing a theme, a letterform
over three characters — and a name shared by a `slug` and a `devicon`, since both are vendored into one flat folder.

## Adding a language

1. Drop the SVG into the folder for its kind (skip for `phosphor`, and for a `letterform`).
2. Add the entry, seeding `color` with the brand hex in both themes — where the kind takes one at all.
3. `dart run bin/file-icons/emit_typescript_icons.dart` — resolves every tint in the map in place (`lib/src/tints.dart`
   is a library, never run on its own; the pass is idempotent), then vendors the referenced assets into
   `packages/components/src/assets/file-icons/` and writes `packages/components/src/lib/file-icons.gen.ts`. Both
   are generated: the folder is rebuilt from scratch each run, so an icon dropped from the map stops being vendored.

   Every import it writes ends `?no-inline`. Under Vite's 4 KB `assetsInlineLimit` these would become `data:` URIs
   inside the initial JS chunk — 57 KB gzipped of artwork the browser otherwise fetches only when `FileIcon` draws
   it. `packages/components` asserts the suffix, and one import per vendored file (`file-icons.gen.test.ts`), so
   dropping it fails that suite rather than a build nobody measures.
4. Rebless the `file-icon` sheet, which covers every kind and the resolution order — only needed if the entry you
   touched appears on it. **Path before the flag**, per `packages/components/AGENTS.md`:

   ```sh
   pnpm --filter @elsewise/components exec vitest run --project visual test/visual/file-icon.test.tsx --update
   ```

## Tints

Every tint clears **3:1** against its theme's `--surface-2` — WCAG 1.4.11, measured against the hardest surface a file
icon can land on, so clearing it there clears `--surface` and `--background` too. `tints.dart` splits by chroma:

- **Achromatic** (OKLCH chroma < 0.04 — a mark deliberately black or white) **inverts to the theme's ink.** Clamping
  one only ever yields a gray: it spends the brand color and buys nothing.
- **Chromatic** keeps hue and chroma and moves **lightness only** until it clears the bar, because hue is the part of a
  brand color worth keeping.

`test/src/file_icons/file_icons_golden_test.dart` paints every entry the way `FileIcon` does, on each theme's
`--surface-2`, one golden sheet per kind at `test/golden/<os>/file-icons/<theme>/<kind>.png` — each tint with its
measured ratio, and any under 3:1 outlined, for eye-testing what the numbers cannot settle. Rebless after any change to
the map:

```sh
flutter test --update-goldens
```

The tests need Flutter and a `pnpm install`: fonts and Phosphor paths are read from `packages/components/node_modules`.
Goldens are per-platform and only macOS is blessed.

## Constraints worth knowing

- **Letterforms cap at three characters, and the cap is a budget.** The tile is a 16px box, so its border leaves ~14px
  of usable width and the type steps down by length to stay inside it: **1–2 characters at 8.5px, 3 at 5.75px**. The
  step is not decoration — one size for the whole set works out at 5.9px, which is the three-character size applied to
  everything, and two-letter marks lose half their legibility for nothing.

  Each step is set by the *widest* mark at that length — `MK` clears 8.7px, `HAM` clears 5.9px — so adding a wider
  entry shrinks every letterform of that length. A fourth character is therefore not a local decision: `HAML` held the
  whole set at 5.75px until it was cut to `HAM`. Check a new mark against `MK` or `HAM` before adding it; an overflow
  fails nothing, it just spills past the tile's border. The sizes live in `file-icon.tsx` (`LETTER_SIZE`).

  At a 16px lane the tile and large three-letter marks are mutually exclusive. The tile was removed on this argument
  and restored on 2026-08-07 because the marks read worse without it — the smaller type is the accepted cost.
- **A glyph is masked, not drawn.** `file-icon.tsx` imports the vendored SVG as a URL, so its own fills are out of
  reach — it masks the silhouette and paints the tint through it. Keep `slug` assets monochrome; anything
  multi-color belongs under `devicon`, which is shown as-is.
- **`phosphor` names are a closed set.** The `phosphor` variant's `name` union is built from whatever the map uses,
  plus `file` — the default, seeded by `emit_typescript_icons.dart` so that a name neither table covers still resolves
  to a spec and `FileIcon` carries no branch for the miss. A renderer keys its lookup on
  `Extract<FileIconData, { kind: 'phosphor' }>['name']`, so a new name needs that lookup extended, or the build fails.
