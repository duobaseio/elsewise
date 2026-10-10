import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PEER_MODULES } from '@elsewise/plugin/build';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { peerModules } from './vite/peer-modules.ts';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // TODO: Remove once the daemon serves worktrees. Until then, the editor shows a file in this repository.
  define: {
    'import.meta.env.ELSEWISE_REPOSITORY': JSON.stringify(pathToFileURL(path.join(import.meta.dirname, '../../')).href),
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: false }),
    viteReact(),
    peerModules(PEER_MODULES),
  ],
});
