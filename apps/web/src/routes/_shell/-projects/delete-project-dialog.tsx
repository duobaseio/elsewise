import { Button } from '@elsewise/components/components/button';
import { Checkbox } from '@elsewise/components/components/checkbox';
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
import { toast } from '@elsewise/components/components/toast';
import type { ProjectId } from '@elsewise/frontend-plugin';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { projectsQuery } from '@/projects/project-manager';

/**
 * The dialog that deletes a project and its workspaces, and optionally their files, opened with the project's id
 * through the projects' `deleteDialog` handle. It stays open until the deletion finishes.
 */
export function DeleteProjectDialog() {
  const projects = useApplicationManager().projects;
  const [deleteFiles, setDeleteFiles] = useState(false);

  const remove = useMutation({
    mutationFn: (project: ProjectId) => projects.delete(project, { deleteFiles }),
    onSuccess: () => projects.deleteDialog.close(),
    onError: (error) => toast.add({ type: 'error', title: 'Deleting project failed', description: error.message }),
  });

  return (
    <Dialog
      handle={projects.deleteDialog}
      onOpenChange={(next, details) => {
        if (remove.isPending && details.reason !== 'imperative-action') {
          details.cancel();
        } else if (next) {
          setDeleteFiles(false);
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <DeleteProjectDialogContent
            deleteFiles={deleteFiles}
            id={payload}
            onDelete={() => remove.mutate(payload)}
            onDeleteFilesChange={setDeleteFiles}
            pending={remove.isPending}
          />
        )
      }
    </Dialog>
  );
}

function DeleteProjectDialogContent({
  id,
  deleteFiles,
  onDeleteFilesChange,
  pending,
  onDelete,
}: {
  id: ProjectId;
  deleteFiles: boolean;
  onDeleteFilesChange: (deleteFiles: boolean) => void;
  pending: boolean;
  onDelete: () => void;
}) {
  const projects = useQuery(projectsQuery(id.daemon));
  const project = projects.data?.find((other) => other.id === id.project);

  return (
    project && (
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete “{project.name}” project?</DialogTitle>
          <DialogDescription>This project and its workspaces will no longer be tracked.</DialogDescription>
        </DialogHeader>
        {project.state.case !== 'missing' && (
          <Label>
            <Checkbox checked={deleteFiles} disabled={pending} onCheckedChange={onDeleteFilesChange} />
            Delete all workspaces’ files
          </Label>
        )}
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
