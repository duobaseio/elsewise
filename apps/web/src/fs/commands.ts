import { toast } from '@elsewise/components/components/toast';
import {
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  type FileTreeCommand,
  type Workspace,
} from '@elsewise/frontend-plugin';
import { LOCAL_DAEMON_ID } from '@/daemon';
import { FILE_MANAGER } from '@/projects/commands';

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
