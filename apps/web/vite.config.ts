import { PEER_MODULES } from '@elsewise/plugin/build';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { peerModules } from './vite/peer-modules.ts';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: false }),
    viteReact(),
    peerModules(PEER_MODULES),
  ],
});
