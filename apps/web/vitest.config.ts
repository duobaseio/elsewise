import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';

// Separate from `vite.config.ts`, whose plugins build the app and aren't needed to test it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          // Vitest empties CSS, even imported `?raw`, unless included here. The themes' tests compare against
          // elsewise.css.
          css: { include: [/elsewise\.css/] },
        },
      },
      browserProject('browser', ['src/**/*.browser.test.tsx'], { frozenMotion: false }),
      browserProject('visual', ['test/visual/**/*.test.{ts,tsx}'], { frozenMotion: true }),
    ],
  },
});

function browserProject(
  name: string,
  include: readonly string[],
  { frozenMotion }: { frozenMotion: boolean },
): TestProjectInlineConfiguration {
  return {
    extends: true,
    plugins: [tailwindcss(), viteReact()],
    // Discovered mid-run, a dependency reloads the page to re-optimize, which fails whichever test file was
    // loading at the time. Naming everything the tests import optimizes it all up front instead.
    optimizeDeps: {
      include: [
        'react',
        'react-dom/client',
        'vitest-browser-react',
        'react-dom',
        'react-dom/server',
        '@tanstack/react-query',
        '@tanstack/react-router',
        'dockview-react',
        'dompurify',
        '@codemirror/autocomplete',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/language-data',
        '@codemirror/lint',
        '@codemirror/lsp-client',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/view',
        '@lezer/highlight',
        'vscode-languageserver-protocol',
        // The language the tests load, which `language-data` imports on demand.
        '@codemirror/language-data > @codemirror/lang-rust',
        // The components' own dependencies, which the app cannot resolve by name.
        '@elsewise/components > @base-ui/react/*',
        '@elsewise/components > @phosphor-icons/react',
        '@elsewise/components > @pierre/trees',
        '@elsewise/components > @pierre/trees/react',
        '@elsewise/components > class-variance-authority',
        '@elsewise/components > clsx',
        '@elsewise/components > tailwind-merge',
      ],
    },
    test: {
      name,
      include: [...include],
      setupFiles: ['./test/browser-setup.ts', ...(frozenMotion ? ['./test/visual-setup.ts'] : [])],
      // Mirrors the components' browser projects; see their `vitest.config.ts` for why each option is what it is.
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({
          launchOptions: {
            args: ['--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text'],
          },
          contextOptions: {
            deviceScaleFactor: 2,
            colorScheme: 'light',
            reducedMotion: frozenMotion ? 'reduce' : 'no-preference',
          },
        }),
        instances: [{ browser: 'chromium' }],
        viewport: { width: 1440, height: 1000 },
        screenshotFailures: false,
        expect: {
          toMatchScreenshot: {
            comparatorName: 'pixelmatch',
            comparatorOptions: { threshold: 0 },
          },
        },
      },
    },
  };
}
