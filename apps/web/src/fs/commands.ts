import { toast } from '@elsewise/components/components/toast';
import {
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  type FileTreeCommand,
  type Workspace,
} from '@elsewise/frontend-plugin';
import type { ApplicationManager } from '@/application-manager';
import { LOCAL_DAEMON_ID } from '@/daemon';
import { FILE_MANAGER } from '@/projects/commands';
import { sameWorkspace } from '@/projects/workspace-manager';

export const FILE_TREE_NEW_FILE: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.new.file,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'New file…',
  defaultKeys: DEFAULT_KEYS.fileTree.new.file,
  enabled: (_, { paths }) => paths.length <= 1,
  run: ({ fileTree }: ApplicationManager, { workspace, paths: [path] }) => {
    fileTree.newDialog.openWithPayload({ workspace, folder: folderOf(path), kind: 'file' });
    return true;
  },
};

export const FILE_TREE_NEW_FOLDER: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.new.folder,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'New folder…',
  defaultKeys: DEFAULT_KEYS.fileTree.new.folder,
  enabled: (_, { paths }) => paths.length <= 1,
  run: ({ fileTree }: ApplicationManager, { workspace, paths: [path] }) => {
    fileTree.newDialog.openWithPayload({ workspace, folder: folderOf(path), kind: 'folder' });
    return true;
  },
};

export const FILE_TREE_CUT: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.clipboard.cut,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Cut',
  defaultKeys: DEFAULT_KEYS.fileTree.clipboard.cut,
  shown: (_, { paths }) => paths.length > 0,
  enabled: (_, { paths }) => paths.length > 0,
  run: ({ fileTree }: ApplicationManager, { workspace, paths }) => {
    fileTree.clipboard = { cut: true, workspace: workspace.id, paths };
    return true;
  },
};

export const FILE_TREE_COPY: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.clipboard.copy,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Copy',
  defaultKeys: DEFAULT_KEYS.fileTree.clipboard.copy,
  shown: (_, { paths }) => paths.length > 0,
  enabled: (_, { paths }) => paths.length > 0,
  run: ({ fileTree }: ApplicationManager, { workspace, paths }) => {
    fileTree.clipboard = { cut: false, workspace: workspace.id, paths };
    return true;
  },
};

export const FILE_TREE_COPY_PATH: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.clipboard.copyPath,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Copy absolute path',
  defaultKeys: DEFAULT_KEYS.fileTree.clipboard.copyPath,
  shown: (_, { paths }) => paths.length > 0,
  enabled: (_, { paths }) => paths.length > 0,
  run: (_, { workspace, paths }) => {
    void navigator.clipboard.writeText(paths.map((path) => absolutePath(workspace, path)).join('\n'));
    return true;
  },
};

export const FILE_TREE_COPY_RELATIVE_PATH: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.clipboard.copyRelativePath,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Copy path from root',
  defaultKeys: DEFAULT_KEYS.fileTree.clipboard.copyRelativePath,
  shown: (_, { paths }) => paths.length > 0,
  enabled: (_, { paths }) => paths.length > 0,
  run: (_, { paths }) => {
    void navigator.clipboard.writeText(paths.map((path) => path.replace(/\/$/, '')).join('\n'));
    return true;
  },
};

export const FILE_TREE_PASTE: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.clipboard.paste,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Paste…',
  defaultKeys: DEFAULT_KEYS.fileTree.clipboard.paste,
  enabled: ({ fileTree }: ApplicationManager, { workspace, paths }) =>
    paths.length <= 1 && fileTree.clipboard !== null && sameWorkspace(fileTree.clipboard.workspace, workspace.id),
  run: ({ fileTree }: ApplicationManager, { workspace, paths: [path] }) => {
    if (fileTree.clipboard !== null) {
      fileTree.pasteDialog.openWithPayload({ workspace, folder: folderOf(path), clipboard: fileTree.clipboard });
    }
    return true;
  },
};

export const FILE_TREE_CANCEL_CUT: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.clipboard.cancelCut,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Cancel cut',
  defaultKeys: DEFAULT_KEYS.fileTree.clipboard.cancelCut,
  enabled: ({ fileTree }: ApplicationManager, { workspace }) =>
    fileTree.clipboard?.cut === true && sameWorkspace(fileTree.clipboard.workspace, workspace.id),
  run: ({ fileTree }: ApplicationManager) => {
    fileTree.clipboard = null;
    return true;
  },
};

export const FILE_TREE_RENAME: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.edit.rename,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Rename…',
  defaultKeys: DEFAULT_KEYS.fileTree.edit.rename,
  shown: (_, { paths }) => paths.length > 0,
  enabled: (_, { paths }) => paths.length === 1,
  run: ({ fileTree }: ApplicationManager, { workspace, paths: [path] }) => {
    if (path !== undefined) {
      fileTree.renaming = { workspace: workspace.id, path };
    }
    return true;
  },
};

export const FILE_TREE_DELETE: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.edit.delete,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Delete…',
  defaultKeys: DEFAULT_KEYS.fileTree.edit.delete,
  shown: (_, { paths }) => paths.length > 0,
  enabled: (_, { paths }) => paths.length > 0,
  run: ({ fileTree }: ApplicationManager, selection) => {
    fileTree.deleteDialog.openWithPayload(selection);
    return true;
  },
};

export const FILE_TREE_OPEN_FILE_MANAGER: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.open.fileManager,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: `Open in ${FILE_MANAGER}`,
  defaultKeys: DEFAULT_KEYS.fileTree.open.fileManager,
  shown: (_, { workspace, paths }) =>
    paths.length > 0 &&
    workspace.id.daemon === LOCAL_DAEMON_ID &&
    workspace.state !== 'missing' &&
    window.bridge?.window?.showPath !== undefined,
  enabled: (_, { paths }) => paths.length === 1,
  run: ({ platform }, { workspace, paths: [path] }) => {
    if (path === undefined) {
      return true;
    }

    void platform
      .showPath(absolutePath(workspace, path))
      .catch((error: Error) =>
        toast.add({ type: 'error', title: `Opening ${FILE_MANAGER} failed`, description: error.message }),
      );
    return true;
  },
};

/**
 * Returns the absolute path of `path`, relative to `workspace`, joined with the workspace's separator.
 */
export function absolutePath(workspace: Workspace, path: string): string {
  const separator = workspace.absolutePath.includes('\\') ? '\\' : '/';
  return [workspace.absolutePath.replace(/[\\/]$/, ''), ...path.split('/').filter((segment) => segment !== '')].join(
    separator,
  );
}

function folderOf(path: string | undefined): string {
  return path === undefined || path.endsWith('/') ? (path ?? '') : path.slice(0, path.lastIndexOf('/') + 1);
}
