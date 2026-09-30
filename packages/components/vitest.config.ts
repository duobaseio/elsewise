import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig, type ViteUserConfig } from 'vitest/config';

// A test's runtime is carried by its *name*, not its folder, so tests route correctly wherever they sit:
// `*.browser.test.tsx` needs a layout engine, anything else runs in Node — whether co-located in `src/` or under
// `test/` with its harness. Screenshot sheets are the one folder-bound case — they stay in `test/visual/` with their
// committed baselines, which is what Vitest's own visual-regression guidance recommends and what keeps binary blobs
// out of `src/`.
const NODE_TESTS = '{src,test}/**/*.test.{ts,tsx}';
const BROWSER_TESTS = 'src/**/*.browser.test.{ts,tsx}';
const VISUAL_TESTS = 'test/visual/**/*.test.{ts,tsx}';

// Tailwind is in every project: the browser setup imports the stylesheet, and a component is free to import its own
// CSS `?inline`, which would pull a stylesheet through even a Node test's graph.
function testGraph(): ViteUserConfig {
  return { plugins: [tailwindcss(), viteReact()] };
}

function browserProject(
  name: string,
  include: readonly string[],
  { frozenMotion }: { frozenMotion: boolean },
): ViteUserConfig {
  return {
    ...testGraph(),
    // Discovered mid-run, a dependency reloads the page to re-optimize, which fails whichever test file was loading at
    // the time — a cold-cache-only failure that passes on every rerun. Naming everything the components import
    // optimizes it all up front instead.
    optimizeDeps: {
      include: [
        'react',
        'react-dom/client',
        'vitest-browser-react',
        '@base-ui/react/*',
        '@phosphor-icons/react',
        'class-variance-authority',
        'clsx',
        'tailwind-merge',
      ],
    },
    test: {
      name,
      include: [...include],
      setupFiles: ['./test/browser-setup.ts', ...(frozenMotion ? ['./test/visual-setup.ts'] : [])],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({
          launchOptions: {
            args: [
              // The runner is a VM and this machine is bare metal with Metal
              // available; pin both to the software path.
              '--disable-gpu',
              '--force-color-profile=srgb',
              // Grayscale AA, so nothing depends on subpixel RGB ordering.
              '--disable-lcd-text',
            ],
          },
          contextOptions: {
            deviceScaleFactor: 2,
            // Theming is attribute-based, but UA styles for form controls and
            // scrollbars still follow the media query.
            colorScheme: 'light',
            reducedMotion: frozenMotion ? 'reduce' : 'no-preference',
          },
        }),
        // https://vitest.dev/config/browser/playwright
        instances: [{ browser: 'chromium' }],
        viewport: { width: 1440, height: 1000 },
        screenshotFailures: false,
        expect: {
          toMatchScreenshot: {
            comparatorName: 'pixelmatch',
            // Byte-exact, matching Flutter's `matchesGoldenFile`.
            //
            // Two independent knobs, both at their strictest: `threshold` is the per-pixel perceived-colour delta
            // before a pixel counts as differing at all (it defaults to 0.1, not 0), and leaving the allowance
            // options unset means any non-zero count of differing pixels fails.
            //
            // If this ever flakes, fix the environment rather than the number — a tolerance loose enough to absorb
            // drift is loose enough to hide the 1px translate that `active` applies.
            comparatorOptions: { threshold: 0 },
          },
        },
      },
    },
  };
}

// Three runtimes, one config. Each project names its own `include`, so there is no second list to keep in step.
export default defineConfig({
  test: {
    projects: [
      {
        ...testGraph(),
        test: {
          name: 'node',
          include: [NODE_TESTS],
          exclude: [...configDefaults.exclude, BROWSER_TESTS, VISUAL_TESTS],
        },
      },
      browserProject('browser', [BROWSER_TESTS], { frozenMotion: false }),
      browserProject('visual', [VISUAL_TESTS], { frozenMotion: true }),
    ],
  },
});
