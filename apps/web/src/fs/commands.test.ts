import type { Workspace } from '@elsewise/frontend-plugin';
import { describe, expect, test, vi } from 'vitest';
import { FILE_TREE_OPEN_FILE_MANAGER } from '@/fs/commands';
import { builtInApplication } from '../../test/commands';

const WORKSPACE: Workspace = {
  id: { daemon: 'local', project: 'p', workspace: 'w' },
  name: 'w',
  state: 'ok',
  main: false,
  absolutePath: '/p/w',
};

describe('FILE_TREE_OPEN_FILE_MANAGER', () => {
  test('opens folder, or folder of file', () => {
    const application = builtInApplication();
    const openFolder = vi.spyOn(application.platform, 'openFolder').mockResolvedValue();

    FILE_TREE_OPEN_FILE_MANAGER.run(application, { workspace: WORKSPACE, paths: ['src/lib/'] });
    FILE_TREE_OPEN_FILE_MANAGER.run(application, { workspace: WORKSPACE, paths: ['src/main.ts'] });
    FILE_TREE_OPEN_FILE_MANAGER.run(application, { workspace: WORKSPACE, paths: ['README.md'] });

    expect(openFolder.mock.calls).toEqual([['/p/w/src/lib'], ['/p/w/src'], ['/p/w']]);
  });

  test('joins with backslash on backslashed workspace', () => {
    const application = builtInApplication();
    const openFolder = vi.spyOn(application.platform, 'openFolder').mockResolvedValue();
    const workspace = { ...WORKSPACE, absolutePath: 'C:\\p\\w\\' };

    FILE_TREE_OPEN_FILE_MANAGER.run(application, { workspace, paths: ['src/main.ts'] });

    expect(openFolder).toHaveBeenCalledExactlyOnceWith('C:\\p\\w\\src');
  });

  test('disables several paths', () => {
    const application = builtInApplication();

    expect(FILE_TREE_OPEN_FILE_MANAGER.enabled?.(application, { workspace: WORKSPACE, paths: ['a', 'b'] })).toBe(false);
  });
});
