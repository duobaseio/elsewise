import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { describe, expect, test } from 'vitest';
import { FileTreeManager } from '@/fs/file-tree-manager';

const WORKSPACE: WorkspaceId = { daemon: 'local', project: 'p', workspace: 'w' };

function copied(paths: readonly string[]): FileTreeManager {
  const fileTree = new FileTreeManager();
  fileTree.clipboard = { cut: true, workspace: WORKSPACE, paths };
  return fileTree;
}

describe('moveClipboardPaths', () => {
  test('moves path', () => {
    const fileTree = copied(['a.ts', 'a.ts.bak']);

    fileTree.moveClipboardPaths(WORKSPACE, 'a.ts', 'z.ts');

    expect(fileTree.clipboard).toEqual({ cut: true, workspace: WORKSPACE, paths: ['z.ts', 'a.ts.bak'] });
  });

  test('moves paths under folder', () => {
    const fileTree = copied(['src/', 'src/lib/a.ts', 'srcs/b.ts']);

    fileTree.moveClipboardPaths(WORKSPACE, 'src/', 'lib/');

    expect(fileTree.clipboard?.paths).toEqual(['lib/', 'lib/lib/a.ts', 'srcs/b.ts']);
  });

  test('ignores other workspace', () => {
    const fileTree = copied(['a.ts']);

    fileTree.moveClipboardPaths({ ...WORKSPACE, workspace: 'other' }, 'a.ts', 'z.ts');

    expect(fileTree.clipboard?.paths).toEqual(['a.ts']);
  });
});

describe('deleteClipboardPaths', () => {
  test('deletes paths at or under folder', () => {
    const fileTree = copied(['src/', 'src/a.ts', 'srcs/b.ts', 'README.md']);

    fileTree.deleteClipboardPaths(WORKSPACE, 'src/');

    expect(fileTree.clipboard).toEqual({ cut: true, workspace: WORKSPACE, paths: ['srcs/b.ts', 'README.md'] });
  });

  test('clears clipboard without paths', () => {
    const fileTree = copied(['a.ts']);

    fileTree.deleteClipboardPaths(WORKSPACE, 'a.ts');

    expect(fileTree.clipboard).toBeNull();
  });

  test('ignores other workspace', () => {
    const fileTree = copied(['a.ts']);

    fileTree.deleteClipboardPaths({ ...WORKSPACE, workspace: 'other' }, 'a.ts');

    expect(fileTree.clipboard?.paths).toEqual(['a.ts']);
  });
});
