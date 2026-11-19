import path from 'node:path';
import { PEER_MODULES } from '@elsewise/frontend-plugin/build';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fakeGit } from './vite/fake-git.ts';
import { peerModules } from './vite/peer-modules.ts';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: false, routeFileIgnorePattern: '\\.test\\.' }),
    viteReact(),
    peerModules(PEER_MODULES),
    // TODO: Remove once the daemon's git service reads files at a revision.
    fakeGit(path.join(import.meta.dirname, '../../')),
  ],
});
