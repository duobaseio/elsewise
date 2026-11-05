import { Button } from '@elsewise/components/components/button';
import { Checkbox } from '@elsewise/components/components/checkbox';
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
import { toast } from '@elsewise/components/components/toast';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useApplicationManager } from '@/application-context';
import type { Project } from '@/gen/elsewise/daemon/project/v1/project_service_pb';

/**
 * The dialog that deletes `project` and its workspaces, and optionally their files, opened through `handle`. It stays
 * open until the deletion finishes.
 */
export function DeleteProjectDialog({
  daemonId,
  project,
  handle,
}: {
  daemonId: string;
  project: Project;
  handle: ReturnType<typeof createDialogHandle>;
}) {
  const projects = useApplicationManager().projects;
  const [open, setOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  const remove = useMutation({
    mutationFn: () => projects.delete({ daemon: daemonId, project: project.id }, { deleteFiles }),
    onSuccess: () => setOpen(false),
    onError: (error) => toast.add({ type: 'error', title: 'Deleting project failed', description: error.message }),
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
          setDeleteFiles(false);
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete “{project.name}” project?</DialogTitle>
          <DialogDescription>This project and its workspaces will no longer be tracked.</DialogDescription>
        </DialogHeader>
        {project.state.case !== 'missing' && (
          <Label>
            <Checkbox checked={deleteFiles} disabled={remove.isPending} onCheckedChange={setDeleteFiles} />
            Delete all workspaces’ files
          </Label>
        )}
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
