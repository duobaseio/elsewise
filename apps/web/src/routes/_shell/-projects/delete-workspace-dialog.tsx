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
import { Label } from '@elsewise/components/components/label';
import { RadioGroup, RadioGroupItem } from '@elsewise/components/components/radio-group';
import { toast } from '@elsewise/components/components/toast';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { workspacesQuery } from '@/projects/workspace-manager';

type Deleting = 'workspace' | 'files' | 'branch';

/**
 * The dialog that deletes a workspace, and optionally its files and branch, opened with the workspace's id through the
 * sidebar's dialog handle. It stays open until the deletion finishes.
 */
export function DeleteWorkspaceDialog() {
  const { projects, sidebar } = useApplicationManager();
  const [deleting, setDeleting] = useState<Deleting>('workspace');

  const remove = useMutation({
    mutationFn: (workspace: WorkspaceId) =>
      projects.workspaces.delete(
        workspace,
        deleting === 'workspace' ? {} : { deleteFiles: true, deleteBranch: deleting === 'branch' },
      ),
    onSuccess: () => sidebar.deleteWorkspaceDialog.close(),
    onError: (error) => toast.add({ type: 'error', title: 'Deleting workspace failed', description: error.message }),
  });

  return (
    <Dialog
      handle={sidebar.deleteWorkspaceDialog}
      onOpenChange={(next, details) => {
        if (remove.isPending && details.reason !== 'imperative-action') {
          details.cancel();
        } else if (next) {
          setDeleting('workspace');
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <DeleteWorkspaceDialogContent
            deleting={deleting}
            id={payload}
            onDelete={() => remove.mutate(payload)}
            onDeletingChange={setDeleting}
            pending={remove.isPending}
          />
        )
      }
    </Dialog>
  );
}

function DeleteWorkspaceDialogContent({
  id,
  deleting,
  onDeletingChange,
  pending,
  onDelete,
}: {
  id: WorkspaceId;
  deleting: Deleting;
  onDeletingChange: (deleting: Deleting) => void;
  pending: boolean;
  onDelete: () => void;
}) {
  const workspaces = useQuery(workspacesQuery(id.daemon, id.project));
  const workspace = workspaces.data?.find((other) => other.id === id.workspace);

  return (
    workspace && (
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete “{workspace.name}” workspace?</DialogTitle>
          <DialogDescription>This workspace will no longer be tracked.</DialogDescription>
        </DialogHeader>
        <RadioGroup aria-label="What to delete" disabled={pending} onValueChange={onDeletingChange} value={deleting}>
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
          <DialogClose disabled={pending} render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={onDelete} pending={pending} variant="destructive">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    )
  );
}
