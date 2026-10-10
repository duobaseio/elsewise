# /// script
# dependencies = ["fonttools", "brotli", "uharfbuzz"]
# ///
"""
Strips the `//` and `///` ligatures from JetBrains Mono as they don't render properly in Chromium.

Remove this if/when they fix it.
"""

from io import BytesIO
from pathlib import Path

import uharfbuzz
from fontTools.ttLib import TTFont

LIGATURES = {"slash_slash.liga", "slash_slash_slash.liga"}
SOURCE = Path("node_modules/@fontsource-variable/jetbrains-mono/files")
TARGET = Path("src/assets/fonts")


def shape(font: TTFont, text: str) -> list[str]:
    # HarfBuzz reads sfnt, not WOFF2.
    sfnt = BytesIO()
    font.flavor = None
    font.save(sfnt)
    hb = uharfbuzz.Font(uharfbuzz.Face(sfnt.getvalue()))
    buffer = uharfbuzz.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    uharfbuzz.shape(hb, buffer)
    return [hb.get_glyph_name(info.codepoint) for info in buffer.glyph_infos]


for style in ["normal", "italic"]:
    name = f"jetbrains-mono-latin-wght-{style}.woff2"
    font = TTFont(SOURCE / name)
    lookups = font["GSUB"].table.LookupList.Lookup

    # A single-substitution lookup that produces a slash ligature, and every chaining lookup that calls it.
    producers = {
        i
        for i, lookup in enumerate(lookups)
        for subtable in lookup.SubTable
        if getattr(subtable, "ExtSubTable", subtable).LookupType == 1
        and LIGATURES & set(getattr(subtable, "ExtSubTable", subtable).mapping.values())
    }
    callers = {
        i
        for i, lookup in enumerate(lookups)
        for subtable in lookup.SubTable
        if getattr(subtable, "ExtSubTable", subtable).LookupType == 6
        and any(r.LookupListIndex in producers for r in getattr(subtable, "ExtSubTable", subtable).SubstLookupRecord)
    }
    assert len(callers) == 2, f"{name}: expected one lookup for // and one for ///, found {sorted(callers)}"

    # Each caller only ever spaces and joins slashes, so emptying it drops the ligature and nothing else.
    for i in callers:
        lookups[i].SubTable = []
        lookups[i].SubTableCount = 0

    assert shape(font, "//") == ["slash", "slash"], shape(font, "//")
    assert shape(font, "///") == ["slash", "slash", "slash"], shape(font, "///")
    assert shape(font, "->") != ["hyphen", "greater"], "other ligatures must survive"
    assert shape(font, "/=") != ["slash", "equal"], "other slash ligatures must survive"

    font.flavor = "woff2"
    font.save(TARGET / name)
    print(f"{name}: removed lookups {sorted(callers)}")
