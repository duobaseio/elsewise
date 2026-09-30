# Tools

`elsewise_tool` — the Dart CLI behind the file icons. It resolves each language's tint, vendors the assets the map
uses into `packages/components/`, and emits the lookup tables `FileIcon` reads.

Run everything from this folder (`cd tools`).

## The map

`assets/languages.json` is hand-maintained. It has two sections, both sorted by key: `extensions` (no leading dot —
`zig.zon`, not `.zig.zon`) and `names` (exact filenames, so a dot-file keeps its dot). Each key carries one of four
specs:

| Kind            | Spec                                       | Use it for                                          |
|-----------------|--------------------------------------------|-----------------------------------------------------|
| Monochrome mark | `{"slug": "gnubash", "color": {…}}`        | The default: a Simple Icons glyph, painted in its   |
|                 |                                            | tint. `color` is required.                          |
| Brand           | `{"devicon": "r-original"}`                | A mark that only reads in its own colors. Takes no  |
|                 |                                            | `color`.                                            |
| Letterform      | `{"letterform": "MK", "color": {…}}`       | No usable mark exists. One to three characters.     |
| Media kind      | `{"phosphor": "image"}`                    | The medium is the identity and no vendor owns it.   |

- A `color` is `{"light": …, "dark": …}` and must carry **both** themes. Seed each with the brand hex; the emitter
  resolves them.
- `color` is optional on a letterform and a media kind; without one the mark takes the theme's ink. Omit it on a media
  kind unless the language genuinely owns a color.
- A `slug` names a file in `assets/file-icons/simple-icons/`, a `devicon` one in `assets/file-icons/dev-icons/`. The
  two share no names, since both are vendored into one flat folder.

The emitter refuses a malformed spec or a missing asset rather than emit a table that paints nothing.

## Adding a language

1. Drop the SVG into the folder for its kind (skip for `phosphor` and `letterform`).
2. Add the entry.
3. `dart run bin/file-icons/emit_typescript_icons.dart`. It resolves every tint in the map in place, rebuilds
   `packages/components/src/assets/file-icons/` from scratch, and writes
   `packages/components/src/lib/file-icons.gen.ts`. The pass is idempotent.
4. `flutter test --update-goldens`, and eye-test the sheets.
5. If the entry appears on the `file-icon` visual sheet, rebless it — **path before the flag**, per
   `packages/components/AGENTS.md`:

   ```sh
   pnpm --filter @elsewise/components exec vitest run --project visual test/visual/file-icon.test.tsx --update
   ```

## Tints

Every tint clears **3:1** against its theme's `--surface-2` (WCAG 1.4.11), the hardest surface a file icon can land
on. `lib/src/tints.dart` splits by chroma:

- **Achromatic** (OKLCH chroma < 0.04) inverts to the theme's ink.
- **Chromatic** keeps hue and chroma and moves lightness only until it clears the bar.

`test/src/file_icons/file_icons_golden_test.dart` paints every entry the way `FileIcon` does, one golden sheet per kind
at `test/golden/<os>/file-icons/<theme>/<kind>.png`, each tint with its measured ratio and any under 3:1 outlined.

The tests need Flutter and a `pnpm install`: fonts and Phosphor paths are read from `packages/components/node_modules`.
Goldens are per-platform and only macOS is blessed.

## Constraints

- **Letterforms cap at three characters.** The tile is a 16px box, and the type steps down by length to fit: 1–2
  characters at 8.5px, 3 at 5.75px (`LETTER_SIZE` in `file-icon.tsx`). Each step is set by the widest mark at that
  length, `MK` and `HAM`, so a wider entry shrinks every letterform of that length. Check a new mark against those two;
  an overflow fails nothing, it just spills past the tile's border.
- **A glyph is masked, not drawn.** `file-icon.tsx` masks the SVG's silhouette and paints the tint through it. Keep
  `slug` assets monochrome; anything multi-color belongs under `devicon`.
- **Generated imports end `?no-inline`.** Without it Vite inlines the artwork into the initial JS chunk.
  `file-icons.gen.test.ts` asserts the suffix.
- **`phosphor` names are a closed set**: whatever the map uses, plus `file`, the default for a name neither table
  covers. A name `@phosphor-icons/react` does not export fails the typecheck.
