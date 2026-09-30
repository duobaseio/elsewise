# Tools

`elsewise_tool` — the Dart CLI behind the file-tree's icons. It resolves each language's tint, vendors the assets the
map actually uses into `apps/web/`, and emits the lookup tables the web app imports.

Run everything from this folder (`cd tools`). `make icons` from the repo root runs steps 3 and 4 below together.

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

Both sections are sorted by key. A `color` must carry **both** themes before `tints.dart` runs — seed each with the
brand hex and let the tool resolve them.

Source assets live beside the map, under `assets/icons/simple-icons/` and `assets/icons/dev-icons/`. A spec may only
name a file already sitting there; `emit_web_icons.dart` refuses to emit if one is missing, rather than emitting a table
that paints nothing. Downloading the file is part of adding the entry.

## Adding a language

1. Drop the SVG into the folder for its kind (skip for `phosphor`, and for a `letterform`).
2. Add the entry, seeding `color` with the brand hex in both themes — where the kind takes one at all.
3. `dart run bin/icons/tints.dart` — resolves every tint in place, and is idempotent, so a full-file run is the normal
   run.
4. `dart run bin/icons/emit_web_icons.dart` — vendors the referenced assets into
   `apps/web/src/assets/extension-icons/` and writes `apps/web/src/lib/icons.gen.ts`. Both are generated: the folder is
   rebuilt from scratch each run, so an icon dropped from the map stops being vendored.

   Every import it writes ends `?no-inline`. Under Vite's 4 KB `assetsInlineLimit` these would become `data:` URIs
   inside the initial JS chunk — 57 KB gzipped of artwork the browser otherwise fetches only when a `<symbol>` is
   used. `apps/web` asserts the suffix and the import count, so dropping it fails that suite rather than a build
   nobody measures.
5. Rebless the sheets that paint these icons — `file-icon` covers every kind and the resolution order, `file-tree`
   paints a sample of them in rows. Only needed if the entry you touched appears on one. **Path before the flag**, per
   `apps/web/AGENTS.md`:

   ```sh
   pnpm --filter web exec vitest run --project visual test/visual/components/file-icon.test.tsx --update
   ```

## Tints

Every tint clears **3:1** against its theme's `--surface-2` — WCAG 1.4.11, measured against the hardest surface a file
icon can land on, so clearing it there clears `--surface` and `--background` too. `tints.dart` splits by chroma:

- **Achromatic** (OKLCH chroma < 0.04 — a mark deliberately black or white) **inverts to the theme's ink.** Clamping
  one only ever yields a gray: it spends the brand color and buys nothing.
- **Chromatic** keeps hue and chroma and moves **lightness only** until it clears the bar, because hue is the part of a
  brand color worth keeping.

`dart run bin/icons/render_icons.dart` writes `.dart_tool/icon-contrast.html` — every icon and tile on both surfaces
with its measured ratio, for eye-testing what the numbers cannot settle.

## Constraints worth knowing

- **Letterforms cap at three characters, and the cap is a budget.** The tile is a 16px box, so its border leaves ~14px
  of usable width and the type steps down by length to stay inside it: **1–2 characters at 8.5px, 3 at 5.75px**. The
  step is not decoration — one size for the whole set works out at 5.9px, which is the three-character size applied to
  everything, and two-letter marks lose half their legibility for nothing.

  Each step is set by the *widest* mark at that length — `MK` clears 8.7px, `HAM` clears 5.9px — so adding a wider
  entry shrinks every letterform of that length. A fourth character is therefore not a local decision: `HAML` held the
  whole set at 5.75px until it was cut to `HAM`. Check a new mark against `MK` or `HAM` before adding it; an overflow
  is invisible in the web app but **clipped** in the tree, where a `<symbol>` crops to its viewBox.

  At a 16px lane the tile and large three-letter marks are mutually exclusive. The tile was removed on this argument
  and restored on 2026-08-07 because the marks read worse without it — the smaller type is the accepted cost. The tree
  draws the same tile at the same two sizes (`icons.ts`), so both surfaces share one budget.
- **A glyph is masked, not drawn.** The web app imports the vendored SVG as a URL, so its own fills are out of reach —
  `file-icon.tsx` masks the silhouette and paints the tint through it. Keep `slug` assets monochrome; anything
  multi-color belongs under `devicon`, which is shown as-is.
- **`phosphor` names are a closed set.** The emitted `PhosphorIcon` union is built from whatever the map uses, plus
  `file` — the fallback, seeded by `emit_web_icons.dart` so that a name neither table covers still resolves to a spec
  and the web app carries no branch for the miss. `file-icon.tsx` maps each name to a component, so a new name needs
  that lookup extended, or the build fails.
