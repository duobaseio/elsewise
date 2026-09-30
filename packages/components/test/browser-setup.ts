import { beforeAll } from 'vitest';

import '../src/styles.css';

// @fontsource only declares @font-face; a browser fetches a face lazily, when a glyph first needs it. Nothing has
// rendered yet at setup time, so awaiting `document.fonts.ready` on its own would resolve immediately — there is no
// pending load to wait for. The explicit `load()` calls are what force the fetch; `ready` then settles them, so the
// faces are warm before the first test renders and no baseline can capture the fallback.
//
// `toMatchScreenshot` retries until it finds a stable screenshot, which already absorbs a font swapping in
// mid-capture. This covers the case that loop cannot see: if the fetch has not started, two consecutive fallback
// captures match each other and the fallback gets blessed. That is a cold-start race, so it is insurance for CI rather
// than a fix for anything observed locally — removing all of this leaves the baselines byte-identical on this machine.
//
// Buttons render `font-sans` (Work Sans) at `font-medium`, the grid labels at the default weight. One variable file
// covers every weight, so a single size per weight is enough to force the fetch.
const FACES = ['400 14px "Work Sans Variable"', '500 14px "Work Sans Variable"'];

beforeAll(async () => {
  await Promise.all(FACES.map((face) => document.fonts.load(face)));
  await document.fonts.ready;
});
