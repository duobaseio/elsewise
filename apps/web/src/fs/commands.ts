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

export const FILE_TREE_RENAME: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.edit.rename,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Rename…',
  defaultKeys: DEFAULT_KEYS.fileTree.edit.rename,
  enabled: (_, { paths }) => paths.length === 1,
  run: ({ fileTree }: ApplicationManager, { workspace, paths: [path = ''] }) => {
    fileTree.renaming = { workspace: workspace.id, path };
    return true;
  },
};

export const FILE_TREE_DELETE: FileTreeCommand = {
  scope: 'fileTree',
  id: DEFAULT_COMMANDS.fileTree.edit.delete,
  group: DEFAULT_COMMAND_GROUPS.fileTree.id,
  label: 'Delete…',
  defaultKeys: DEFAULT_KEYS.fileTree.edit.delete,
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
  shown: (_, { workspace }) =>
    workspace.id.daemon === LOCAL_DAEMON_ID &&
    workspace.state !== 'missing' &&
    window.bridge?.window?.openFolder !== undefined,
  enabled: (_, { paths }) => paths.length === 1,
  // TODO: Reveal a file in its folder once the platform can, instead of opening the folder.
  run: ({ platform }, { workspace, paths }) => {
    const [path = ''] = paths;
    const folder = path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
    void platform
      .openFolder(absolutePath(workspace, folder))
      .catch((error: Error) =>
        toast.add({ type: 'error', title: `Opening ${FILE_MANAGER} failed`, description: error.message }),
      );
    return true;
  },
};

function absolutePath(workspace: Workspace, path: string): string {
  const separator = workspace.absolutePath.includes('\\') ? '\\' : '/';
  return [workspace.absolutePath.replace(/[\\/]$/, ''), ...path.split('/').filter((segment) => segment !== '')].join(
    separator,
  );
}
