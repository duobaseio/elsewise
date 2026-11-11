import { Button } from '@elsewise/components/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@elsewise/components/components/dialog';
import { toast } from '@elsewise/components/components/toast';
import type { FileTreeSelection } from '@elsewise/frontend-plugin';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApplicationManager } from '@/application-context';
import { daemonQuery } from '@/daemon';

export function DeleteEntriesDialog() {
  const { fileTree } = useApplicationManager();
  const client = useQueryClient();

  const remove = useMutation({
    mutationFn: async ({ workspace, paths }: FileTreeSelection) => {
      const daemon = await client.query(daemonQuery(workspace.id.daemon));
      const folders = paths.filter((path) => path.endsWith('/'));
      for (const path of paths) {
        if (folders.some((folder) => folder !== path && path.startsWith(folder))) {
          continue;
        }

        try {
          await daemon.fileSystem.deleteEntry({ root: workspace.absolutePath, relativePath: path.replace(/\/$/, '') });
          fileTree.deleteClipboardPaths(workspace.id, path);
        } catch (error) {
          toast.add({
            type: 'error',
            title: `Deleting “${name(path)}” failed`,
            description: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
    onSuccess: () => fileTree.deleteDialog.close(),
    onError: (error) => toast.add({ type: 'error', title: 'Deleting failed', description: error.message }),
  });

  return (
    <Dialog
      handle={fileTree.deleteDialog}
      onOpenChange={(_, details) => {
        if (remove.isPending && details.reason !== 'imperative-action') {
          details.cancel();
        }
      }}
    >
      {({ payload }) => {
        if (payload === undefined) {
          return null;
        }

        const folders = payload.paths.filter((path) => path.endsWith('/')).length;
        const kinds = folders === 0 ? 'files' : folders === payload.paths.length ? 'folders' : 'files and folders';
        return (
          <DialogContent className="max-w-md" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>
                {payload.paths.length === 1
                  ? `Delete “${name(payload.paths[0] ?? '')}” ${payload.paths[0]?.endsWith('/') ? 'folder' : 'file'}?`
                  : `Delete ${payload.paths.length} ${kinds}?`}
              </DialogTitle>
              <DialogDescription>
                {folders === 0
                  ? `${payload.paths.length === 1 ? 'This file' : 'These files'} will be permanently deleted.`
                  : `${folders === 1 ? 'This folder’s' : 'These folders’'} files and subfolders will be permanently deleted.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose disabled={remove.isPending} render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button onClick={() => remove.mutate(payload)} pending={remove.isPending} variant="destructive">
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        );
      }}
    </Dialog>
  );
}

function name(path: string): string {
  return path.replace(/\/$/, '').split('/').at(-1) ?? path;
}
