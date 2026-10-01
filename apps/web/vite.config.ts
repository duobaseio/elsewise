import { SHARED_MODULES } from '@elsewise/api';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { sharedModules } from './vite/shared-modules.ts';

export default defineConfig(({ mode }) => ({
  // Electron loads the built app over file://, which needs relative asset paths.
  base: mode === 'electron' ? './' : '/',
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: false }),
    viteReact(),
    sharedModules(SHARED_MODULES),
  ],
}));
