import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_WORKSPACE_STATE, WorkspaceState } from '@elsewise/bridge';
import { frontendDataDir, writeJsonSync } from '@elsewise/core/node';
import { ipcMain } from 'electron';
import * as z from 'zod';

const Segment = z.string().regex(/^[\w-]+$/);
const ProjectId = z.object({ daemon: Segment, project: Segment });
const WorkspaceId = ProjectId.extend({ workspace: Segment });

/**
 * Handles the renderer's `workspaces:load`, `workspaces:save` and `workspaces:delete`, which read, replace and delete
 * `<frontend data folder>/workspaces/<daemon>/<project>/<workspace>.json`.
 */
export function handleWorkspaces(): void {
  ipcMain.handle('workspaces:load', (_event, workspace: unknown) => {
    const file = workspaceFile(workspace);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('workspaces: unreadable, starting from defaults', error);
      }
      parsed = {};
    }

    return WorkspaceState.catch(DEFAULT_WORKSPACE_STATE).parse(parsed);
  });
  ipcMain.handle('workspaces:save', (_event, workspace: unknown, state: unknown) => {
    writeJsonSync(workspaceFile(workspace), WorkspaceState.parse(state));
  });
  ipcMain.handle('workspaces:delete', (_event, id: unknown) => {
    const parsed = WorkspaceId.safeParse(id);
    if (parsed.success) {
      fs.rmSync(workspaceFile(parsed.data), { force: true });
    } else {
      const { daemon, project } = ProjectId.parse(id);
      fs.rmSync(path.join(frontendDataDir(), 'workspaces', daemon, project), { recursive: true, force: true });
    }
  });
}

function workspaceFile(workspace: unknown): string {
  const { daemon, project, workspace: id } = WorkspaceId.parse(workspace);
  return path.join(frontendDataDir(), 'workspaces', daemon, project, `${id}.json`);
}
