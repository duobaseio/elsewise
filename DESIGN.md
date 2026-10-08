# Elsewise Design System

"Elsewise" is an archaic English adverb meaning "in a different manner" or "otherwise".

It's old-world, literary, slightly bookish. Because it's archaic, it feels like a word rescued from Chaucer or a dusty
legal document. That gives it a crafted, thoughtful character — more fountain pen than neon.

It evokes divergence, possibility, lateral thinking. There's something inherently exploratory and non-linear about it.

## Color

The interface, editor and terminal are each colored by a **theme**. A theme has a light and dark variant. A missing
variant defaults to Elsewise's theme. A theme states the terminal's ANSI-16, a missing color defaulting to Elsewise's;
the terminal's background, foreground, cursor and selection default to the editor's.

## Default Elsewise Theme

### Application

#### Fields

- **Background — the page:** `#FFFFFF` / `#14181F`
- **Surface — paper / wash:** `#FEFDFB` / `#1B2129` — panes, cards, sidebars
- **Surface-2 — vellum / pool:** `#FCFAF6` / `#232A34` — wells, insets
- **Elevated:** `#FFFFFF` + shadow / `#262E39` — popovers, dialogs; dark elevates by lightening, not shadow
    - Everything transient draws elevated paper and a hairline ring (foreground at 10%)
    - Menus, selects, comboboxes and tooltips cast `shadow-md`; submenus, dialogs and toasts cast `shadow-lg`
    - Dialogs and toasts are `rounded-xl`
    - Tooltips are chip scale, `rounded-md`, arrowless
    - No inverse-surface tooltips: the solid ink slab means a control that is *on*, never a surface
- **Scrim:** `rgba(28,36,48,.45)` / `rgba(0,0,0,.55)`
- **Shadow:** `0 8px 28px rgba(28,36,48,.14)` / `0 8px 28px rgba(0,0,0,.45)` — floating dock groups only

#### Ink (text)

- **Text — ink / paper:** `#1C2430` / `#E9E4D8` — 15.6:1 / 14.0:1 on background
- **Text-2 — faded:** `#5F5A4C` / `#B3AC9A` — secondary, ~7:1
- **Text-3 — pencil / dust:** `#7D7666` / `#8A8474` — muted, ~4.5:1, non-essential only
- **Disabled:** `#A9A395` / `#5E5A4F`
- **Inverse:** `#FEFDFB` / `#14181F` — text on filled elements

#### Lines

- **Border — deckle / seam:** `#F1ECDF` / `#2C333E` — hairlines, dividers
- **Input — strong:** `#C9C2B0` / `#3A4350` — input borders, emphasis
- **Ring — the pen box:** `#334A6B` / `#9FB2C8` — 2px solid `outline`, offset 2px, `:focus-visible` only, never
  animated, never a halo.
    - `outline` because it paints outside the border box and is not a transitioned property: the sliver of paper and the
      instant snap come free. A border or box-shadow gives neither.
    - Rows that abut draw it inset so it never paints over a neighbour: `-outline-offset-1` on sidebar rows and dock
      tabs, −2px on tree rows.
- **Focused input:** border takes the foreground color; no ring. The split is by shape at rest: a control that already
  draws a full rectangle answers focus with its edge (inputs, the select trigger); a small control takes the pen box
  (checkbox, switch).
- **Disabled field:** 50% opacity on the whole control, nothing else. No disabled fill — a fill only patched light
  mode's missing rest fill.

#### Actions

Every fill goes rest → hover as two *named* colors — the hue moves, never the opacity. Alpha and mix tricks gray-out
warm materials. Exceptions: Disabled; the dark fill of bordered controls (Outline, input, select, combobox, checkbox),
strong line at 30%, 50% under a hovered select or combobox trigger; and a focused destructive menu item, error ink at
10% / 20%.

- **Primary — the material inversion:** ink by day, paper by night
    - Fill: `#1C2430` → hover `#334A6B` / `#E9E4D8` → hover `#FFFBEC`; text `#FEFDFB` / `#14181F`
- **Secondary — the quiet button:** vellum fill, foreground text, no border. Hover: the fill deepens to its line,
  `#F1ECDF` / `#3A4350`
- **Outline:** page fill (`#FFFFFF` / strong line at 30%), deckle / strong-line border, inherited text
    - Border weight unresolved: even the strong line is 1.8:1 against the 3:1 non-text bar — settle when the variant
      gets real use
- **Ghost — the quietest button:** no fill, no border, inherited text. Belongs in dense chrome; it earns its affordance
  on hover
- **Ghost and Outline hover with the Hover state layer**, label and icon keep their ink. `aria-expanded` takes the
  Selected layer; Outline drops its rest fill for the duration
- **Select and combobox triggers hover with a fill:** vellum (Surface-2) / strong line at 50%
- **Switch — the instant setting:** checked track is ink with a paper thumb, the same slab as the checked checkbox;
  unchecked, the strong line. 18 × 32, pen box on focus
    - Switch when the value applies the moment it moves (settings rows, right-aligned, detached from its label);
      checkbox when the value is collected for something else to act on (forms, filters), label-adjacent
- **Destructive — the error voice as a button:** error wash fill, error ink text, never solid madder at rest. Hover
  `#F5DBD7` / `#472F2D`
    - Solid madder (`#B3362B` white text / `#E08A7E` ink text) is reserved for irreversible confirms inside dialogs —
      undecided
- **Link — iron gall:** `#334A6B` → hover `#293B56` / `#9FB2C8` → hover `#B9C8DA`
- **Disabled:** the control's own colors at 50% opacity, one rule for every control. Disabling is the only state allowed
  to use opacity: it is the only one that makes a control *less* present
    - Style it off the attribute the element carries: `disabled:` on a native control (button, input, select trigger,
      toggle); `data-disabled` (presence form, never `="true"`) on Base UI parts that render a `<span>`, where
      `:disabled` dies (checkbox, switch, menu items)
    - Pointer treatment unresolved: `pointer-events-none` vs `cursor-not-allowed`; the former also blocks a "why is this
      disabled?" tooltip

#### State layers (overlays on neutral surfaces)

Ink/paper at low alpha, one pigment at rising strength. Neutral ground only — rows, trees, toolbar icons, wells; on
chromatic fills they read as dirt. A layer composites, so it holds its contrast on any Field token; a Field token used
as a fill is invisible against at least one other (the light ladder is 1.04:1 end to end). Hover paints as a background
*image* so it adds to a selected row instead of replacing it.

- **Hover:** `rgba(95,90,76,.06)` / `rgba(233,228,216,.05)`. No press layer — buttons answer press with a 1px translate
- **Selected (focused list/tree):** `rgba(95,90,76,.09)` / `rgba(233,228,216,.08)` — one step above Hover; heavier reads
  as a grey bar across the pane
- **Selection (::selection text):** `rgba(51,74,107,.18)` / `rgba(159,178,200,.25)` — iron gall, because a warm neutral
  on text reads as a smudge
- **Inactive selection (unfocused pane):** `rgba(95,90,76,.04)` / `rgba(233,228,216,.04)` — the active tab of an
  unfocused dock group
- **Skeleton:** `rgba(95,90,76,.10)` / `rgba(233,228,216,.10)` — a mark, not a ground
- **Drop target:** info wash + dashed info line
- **Badge:** primary fill, inverse text; semantic badges use their quad
- **Scrollbar thumb:** border at rest → strong on hover → disabled ink on drag

#### Semantic voices (quads: ink / wash / line)

- **Success — verdigris:** `#2E7A54` · `rgba(62,107,92,.10)` · `#A9C6BB` — dark: `#8FBCAA` · `rgba(143,188,170,.12)` ·
  `#3E5A50`
- **Info — iron gall:** `#4868B1` · `rgba(51,74,107,.08)` · `#B3BFD0` — dark: `#9FB2C8` · `rgba(159,178,200,.12)` ·
  `#3E4E66`
- **Warning — gilt:** ink `#8F6A24` (text) · fill `#B98D3F` (fills only) · `rgba(185,141,63,.10)` · `#D9C08A` — dark:
  `#D9B36A` · `rgba(217,179,106,.12)` · `#6A5630`
- **Error — madder:** `#B3362B` · `rgba(179,54,43,.09)` · `#E0A49E` — dark: `#E08A7E` · `rgba(224,138,126,.12)` ·
  `#6E3A33`. Madder is the alarm red, not oxblood
- **Match:** `rgba(185,141,63,.22)` / `rgba(217,179,106,.20)` — the warning wash at strength, for a search landing. The
  editor's search matches are opaque gold instead; see Editor

Success and Info light inks were lifted for contrast against ink (3.0 and 2.9); their wash, line and chart colors stay
on the original pigments (`#3E6B5C`, `#334A6B`).

### Editor

#### Syntax

Most code is ink. Color marks only what is worth finding at a glance, and each role keeps roughly the contrast IntelliJ
gives it: keywords and properties heavy, strings and numbers in the middle, variables, annotations and comments light.
A color is tuned within its pigment — darker, lighter or more saturated — never drifting to the next hue.

| Role                   | Light                          | Dark                                   |
|------------------------|--------------------------------|----------------------------------------|
| keyword                | `#004393` 9.4                  | `#DA702C` 5.4                          |
| string                 | `#0D8124` 5.0                  | `#879A39` 5.7                          |
| number                 | `#7139C9` 6.7                  | `#3AA99F` 6.2                          |
| property, constant     | `#920E61` 8.5, constant italic | `#CE5D97` 4.8; constant paper          |
| variable, parameter    | `#008679` 4.5                  | paper                                  |
| function               | ink                            | `#66A0C8` 6.3                          |
| type, class, namespace | ink                            | paper                                  |
| annotation             | `#B68000` 3.5                  | `#D0A215` 7.5                          |
| comment                | `#888170` 3.9, italic          | `#8A8474` 4.8; doc comment italic      |

- **No olive on white.** A yellow-green cannot be both dark and vivid, so on white it reads washed out and tires the
  eye. On dark it is light enough to keep its color.
- **Types are ink.** They are frequent, and a colored type turns every signature into a stripe.
- **Italic is JetBrains Mono's true italic**, loaded with the upright; a slanted upright reads as a different font.

#### Highlights

- **Selection:** iron gall, as the application's Selection
- **Matched bracket — verdigris:** `#7AD2B6` / `#00614C`, opaque. No other editor highlight is verdigris, and it is as
  saturated as its lightness allows: one character, shown only beside the cursor, and something you are looking for
- **Search match — gold:** `#F0D186` / `#5E4A14`, opaque. The current match keeps the fill and takes a 1px outline in
  the warning ink (`#8F6A24` / `#D9B36A`), drawn outside the text so it never crosses a glyph. The fill stays light so
  syntax colors stay legible on it; the current match is told apart by its edge, never a darker fill
- **Selected-word match, current line:** the Selected and Hover state layers

#### Diagnostics

- **Squiggles:** CodeMirror's wave in the editor's own voices — error `#E50305` / `#FF0C0B`, warning `#BD7200` /
  `#D9B36A`, info `#4868B1` / `#9FB2C8`. Error and warning are more vivid than the interface's madder and gilt: a thin
  wave mixes with the paper, so a muted ink reads washed out. The red is madder's hue at full chroma, the amber gilt's
- **Hint — pencil / dust, dotted:** `#7D7666` / `#8A8474`, a dotted line under the whole range, as IntelliJ draws it.
  The shape, not a fainter voice, tells it from info
- **Deprecated:** struck through instead of a squiggle, at the font's own strikeout position. Chrome draws
  `line-through` from the ascent alone, too high for JetBrains Mono
- **Unnecessary — pencil / dust:** `#7D7666` / `#8A8474`, and no squiggle, even when it is an error. Unused code is the
  opposite of worth finding, so it loses its color down the ink ramp; fading it would gray-out the warm inks

### Terminal

Elsewise ANSI-16. Red, green, yellow and blue are the voice inks; magenta and cyan are new pigments matched in OKLCH;
brights lift lightness only (+0.08 L / +0.07 L).

| Role    | Light     | Dark      |
|---------|-----------|-----------|
| black   | `#1C2430` | `#3A4350` |
| red     | `#B3362B` | `#E08A7E` |
| green   | `#2E7A54` | `#8FBCAA` |
| yellow  | `#8F6A24` | `#D9B36A` |
| blue    | `#4868B1` | `#9FB2C8` |
| magenta | `#984780` | `#D295BD` |
| cyan    | `#017B80` | `#7FBEC1` |
| white   | `#A9A395` | `#B3AC9A` |
| bright  | `#7D7666` `#D5483B` `#3F9468` `#AB8133` `#5B7FD2` `#B65A9B` `#19959B` `#C9C2B0` | `#8A8474` `#FF9B8D` `#9FD4BF` `#F5C871` `#B2C9E2` `#EEA7D6` `#8BD7DA` `#FFFBEC` |

## Shape

- **Corners:** `--radius: 0.5rem`. Controls, cards and popovers draw `rounded-lg`, dialogs and toasts `rounded-xl`; the
  preset's multiplier scale (`sm`–`4xl`) is kept. Editorial, not bubbly.

## Charts

1. Iron gall `#334A6B` / `#9FB2C8`
2. Verdigris `#3E6B5C` / `#8FBCAA`
3. Gilt `#B98D3F` / `#D9B36A`
4. Oxblood `#7A2E2E` / `#D99A97`
5. Pencil `#7D7666` / `#8A8474`

---

## Typography
* Display: [**Fraunces**](https://fonts.google.com/specimen/Fraunces).
  * Work Sans's self-description is "a revival of early grotesques, simplified and optimized for screens." Fraunces's
    design brief is the same sentence with the nouns changed: a revival of early-1900s soft display serifs (the
    Windsor/Cooper lineage), rebuilt as a thoroughly modern variable font.
* UI Chrome: [**Work Sans**](https://fonts.google.com/specimen/Work+Sans). Work Sans's roots are in early-1900s
  grotesques, so its forms have a slight irregularity.
    * Inter is the UI chrome for IntelliJ, Conductor & Superset. There's nothing inherently wrong with the font, but it
      feels overused since it is the default font for shad/cn and most ai/vibe-coded slop. Work Sans is less used and
      fits our design system better.
    * Both Work Sans and Inter were [recommended by the designer of JetBrains
      Mono](https://youtrack.jetbrains.com/issue/WRS-2431/Question-JetBrains-Sans-Font#focus=Comments-27-10061987.0-0).
    * Typically ~13px
* Monospaced: [**JetBrains Mono**](https://www.jetbrains.com/lp/mono/). It was explicitly designed to aid code
  readability above all, which is an important quality since most developers spend a lot of time reading through code.
    * Typically ~12px
* Family, size (12–24px) and ligatures are settings, held separately for the interface, the editor and the terminal.
  The system font and any installed family can be chosen. [**Atkinson Hyperlegible
  Next**](https://www.brailleinstitute.org/freefont/) is the interface's one bundled alternative, for low vision.

### Principles

- **Anchor:** `--text-base: 13px`, line 20. Chrome sizes and line-heights are offsets from it, so the font-size setting
  moves the anchor and rescales rhythm with it.
    - px, not rem: root font-size stays untouched so rem spacing and radii keep their proportions. Page zoom scales
      uniformly; OS text scaling is mobile's.
- **Fraunces floor: 20px.** Below that, headings are Work Sans 500.
- **Below 13px, compensate:** letter-spacing `+0.01–0.02em`, consider weight 450–500 — Work Sans is designed for 14px+.
- **Code sits on a fixed line grid:** ×1.54 of the size, rounded (18px at 12). Font swaps never reflow gutters or diffs.
- **No off-scale sizes.** If a component needs a size not listed, the scale changes or the component does.

### Desktop scale

#### Chrome & prose — Work Sans

| Token        | Size / line | Weight             | Usage                                                         |
|--------------|-------------|--------------------|---------------------------------------------------------------|
| `text-2xs`   | 10 / 14     | 500, +0.02em       | Overlines, badge counts — sparingly                           |
| `text-xs`    | 11 / 16     | 400                | Status bar, timestamps, tree metadata                         |
| `text-sm`    | 12 / 16     | 400                | Menus, help text, tooltips, dense tables, secondary controls  |
| `text-base`  | **13 / 20** | 400                | **Default chrome:** buttons, inputs, tabs, tree items, labels, dialog body |
| `text-prose` | 15 / 24     | 400                | Agent conversation, settings descriptions, docs               |

#### Headings — Work Sans below the Fraunces floor

| Token        | Size / line | Weight       | Usage                                       |
|--------------|-------------|--------------|---------------------------------------------|
| `heading-sm` | 13 / 20     | 500, +0.01em | Group headers, section labels within panels |
| `heading`    | 15 / 20     | 500          | Panel titles, dialog titles                 |
| `heading-lg` | 17 / 24     | 500          | View titles, settings page headers          |

#### Display — Fraunces (opsz auto, never below 20)

| Token        | Size / line | Weight | Usage                                   |
|--------------|-------------|--------|-----------------------------------------|
| `display-sm` | 20 / 26     | 500    | Screen titles, empty states             |
| `display`    | 26 / 32     | 500    | Onboarding, welcome, feature moments    |
| `display-lg` | 34 / 40     | 500    | Hero — about screen, marketing surfaces |

#### Code — JetBrains Mono

| Token         | Size / line      | Weight | Usage                                                             |
|---------------|------------------|--------|-------------------------------------------------------------------|
| `code`        | 12 / 18          | 400    | Editor. Size is the monospace setting; the grid is ×1.54, rounded |
| `code-gutter` | 10 / 18          | 400    | Line numbers — editor −2, on the editor's grid                    |
| `code-inline` | 0.85em / inherit | 400    | Inline code in prose — intent, not a token yet                    |
| terminal      | 12 / ×1.38       | 400    | Not a token: xterm takes the terminal font setting as options     |

## Mobile remap

Same tokens, a second value set — the deltas are non-uniform, so a remap, not a rescale. OS text scaling multiplies the
whole set natively. `text-2xs` is unmapped until a mobile surface needs an overline.

| Token        | Desktop → Mobile                                                    |
|--------------|---------------------------------------------------------------------|
| `text-xs`    | 11 → 12                                                             |
| `text-sm`    | 12 → 13                                                             |
| `text-base`  | 13 → 15                                                             |
| `text-prose` | 15 → 16 / 26                                                        |
| `heading`    | 15 → 17                                                             |
| `heading-lg` | 17 → 19                                                             |
| `display-*`  | unchanged                                                           |
| `code`       | 12 → 12 (user-adjustable; wrapped or scrolled, never shrunk to fit) |

## Weight vocabulary

- **400** — everything at rest
- **500** — emphasis, headings, active states
- **No 600+, no 300** in chrome — the ink ramp carries hierarchy before weight does
- **600 in code** marks a completion's matched letters and the active parameter of a signature — JetBrains Mono at 500
  barely differs from 400
- Fraunces: 500 only in-app (400 reserved for large marketing settings)

## Icons

* UI/Chrome: [Phosphor](https://phosphoricons.com)
* Files: [Simple Icons](https://simpleicons.org), `currentColor`, painted in a per-theme tint. Where no usable mark
  exists, a **letterform** tile (1–3 characters); for a mark that only reads in its own colors, a **brand** image; for
  media kinds, a Phosphor glyph. The map is `tools/assets/languages.json`.
    * A glyph wears its language's tint; git status tints only the filename.
    * Tints are resolved at build time: hue and chroma kept, lightness moved in OKLCH until 3:1 against `--surface-2`.
      Achromatic marks invert to the theme's ink.
