import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PROJECT_LAYOUT, ProjectLayout } from '@elsewise/bridge';
import { frontendDataDir, writeJsonSync } from '@elsewise/core/node';
import { ipcMain } from 'electron';

/**
 * Handles the renderer's `projects:load` and `projects:save`, which read and replace
 * `<frontend data folder>/projects.json`.
 */
export function handleProjects(): void {
  ipcMain.handle('projects:load', () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(frontendDataDir(), 'projects.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('projects: unreadable, starting from defaults', error);
      }
      parsed = {};
    }

    return ProjectLayout.catch(DEFAULT_PROJECT_LAYOUT).parse(parsed);
  });
  ipcMain.handle('projects:save', (_event, layout: unknown) => {
    writeJsonSync(path.join(frontendDataDir(), 'projects.json'), ProjectLayout.parse(layout));
  });
}
