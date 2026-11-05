import { Button } from '@elsewise/components/components/button';
import {
  type createDialogHandle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@elsewise/components/components/dialog';
import { Label } from '@elsewise/components/components/label';
import { RadioGroup, RadioGroupItem } from '@elsewise/components/components/radio-group';
import { toast } from '@elsewise/components/components/toast';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import type { Workspace } from '@/gen/elsewise/daemon/project/v1/project_service_pb';

/**
 * The dialog that deletes `workspace`, and optionally its files and branch, opened by the trigger in `children` or
 * through `handle`. It stays open until the deletion finishes.
 */
export function DeleteWorkspaceDialog({
  daemonId,
  workspace,
  handle,
  children,
}: {
  daemonId: string;
  workspace: Workspace;
  handle: ReturnType<typeof createDialogHandle>;
  children: ReactNode;
}) {
  const workspaces = useApplicationManager().projects.workspaces;
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<'workspace' | 'files' | 'branch'>('workspace');

  const remove = useMutation({
    mutationFn: () =>
      workspaces.delete(
        { daemon: daemonId, project: workspace.projectId, workspace: workspace.id },
        deleting === 'workspace' ? {} : { deleteFiles: true, deleteBranch: deleting === 'branch' },
      ),
    onSuccess: () => setOpen(false),
    onError: (error) => toast.add({ type: 'error', title: 'Deleting workspace failed', description: error.message }),
  });

  return (
    <Dialog
      handle={handle}
      onOpenChange={(next) => {
        if (remove.isPending) {
          return;
        }

        setOpen(next);
        if (next) {
          setDeleting('workspace');
        }
      }}
      open={open}
    >
      {children}
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete “{workspace.name}” workspace?</DialogTitle>
          <DialogDescription>This workspace will no longer be tracked.</DialogDescription>
        </DialogHeader>
        <RadioGroup
          aria-label="What to delete"
          disabled={remove.isPending}
          onValueChange={setDeleting}
          value={deleting}
        >
          <Label>
            <RadioGroupItem value="workspace" />
            {workspace.state.case === 'ok' ? 'Keep files and branch' : 'Keep files'}
          </Label>
          <Label>
            <RadioGroupItem value="files" />
            Delete files
          </Label>
          {workspace.state.case === 'ok' && (
            <Label>
              <RadioGroupItem value="branch" />
              Delete files and <code className="font-mono text-sm">{workspace.state.value.branch}</code> branch
            </Label>
          )}
        </RadioGroup>
        <DialogFooter>
          <DialogClose disabled={remove.isPending} render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={() => remove.mutate()} pending={remove.isPending} variant="destructive">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
