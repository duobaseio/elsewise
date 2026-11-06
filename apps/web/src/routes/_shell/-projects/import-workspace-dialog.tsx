import { Button } from '@elsewise/components/components/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@elsewise/components/components/combobox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@elsewise/components/components/dialog';
import { Input } from '@elsewise/components/components/input';
import { Label } from '@elsewise/components/components/label';
import { DEFAULT_ROUTES, type ExistingWorkspaceSource, type ProjectId } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { refsQuery } from '@/git/refs';
import { projectsQuery } from '@/projects/project-manager';
import type { ImportWorkspaceDraft } from '@/projects/sidebar-store';
import { workspacesQuery } from '@/projects/workspace-manager';

interface WorktreeItem {
  readonly absolutePath: string;
  readonly folder: string;
  readonly branch: string;
}

/**
 * The dialog that imports a project's worktree that no workspace has yet as a workspace, opened through the sidebar's
 * dialog handle. It stays open until the workspace is added, then opens it.
 */
export function ImportWorkspaceDialog() {
  const { projects, router, sidebar } = useApplicationManager();
  const [opening, setOpening] = useState(0);

  const add = useMutation({
    mutationFn: ({ project, source }: { project: ProjectId; source: ExistingWorkspaceSource }) =>
      projects.workspaces.add(project, source),
    onSuccess: ({ id }) => {
      sidebar.importWorkspaceDialog.close();
      void router.navigate({ href: DEFAULT_ROUTES.workspace(id.daemon, id.project, id.workspace) });
    },
  });

  return (
    <Dialog
      handle={sidebar.importWorkspaceDialog}
      onOpenChange={(next, details) => {
        if (add.isPending && details.reason !== 'imperative-action') {
          details.cancel();
        } else if (next) {
          add.reset();
          setOpening((count) => count + 1);
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <ImportWorkspaceForm
            error={add.error}
            failedName={
              add.variables
                ? add.variables.source.name || (add.variables.source.absolutePath.split('/').at(-1) ?? '')
                : ''
            }
            key={`${payload.project.daemon}/${payload.project.project}/${opening}`}
            onImport={(source) => add.mutate({ project: payload.project, source })}
            pending={add.isPending}
            draft={payload}
          />
        )
      }
    </Dialog>
  );
}

function ImportWorkspaceForm({
  draft,
  failedName,
  pending,
  error,
  onImport,
}: {
  draft: ImportWorkspaceDraft;
  failedName: string;
  pending: boolean;
  error: Error | null;
  onImport: (source: ExistingWorkspaceSource) => void;
}) {
  const { sidebar } = useApplicationManager();
  const { project: id } = draft;
  const nameId = useId();
  const worktreeId = useId();
  const [name, setName] = useState(draft.name ?? '');
  const [selected, setSelected] = useState(draft.absolutePath ?? '');

  const project = useQuery({
    ...projectsQuery(id.daemon),
    select: (projects) => projects.find((other) => other.id === id.project),
  }).data;
  const workspaces = useQuery(workspacesQuery(id.daemon, id.project)).data;
  const absolutePath = project?.absolutePath ?? '';
  const found = useQuery({
    ...refsQuery(id.daemon, absolutePath),
    select: (refs) => refs.worktrees,
  }).data;

  const workspacePaths = new Set((workspaces ?? []).map((workspace) => workspace.absolutePath));
  const worktrees =
    found && workspaces
      ? found
          .filter((worktree) => !worktree.main && !workspacePaths.has(worktree.absolutePath))
          .map((worktree) => ({
            absolutePath: worktree.absolutePath,
            folder: worktree.absolutePath.split('/').at(-1) ?? '',
            branch: worktree.branch,
          }))
          .sort((a, b) => a.folder.localeCompare(b.folder))
      : null;
  const worktree = worktrees?.find((item) => item.absolutePath === selected) ?? worktrees?.[0] ?? null;

  return (
    project &&
    worktrees && (
      <DialogContent className="max-w-md" showCloseButton={false}>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (worktree) {
              onImport({ type: 'existing', name: name.trim(), absolutePath: worktree.absolutePath });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Import workspace into “{project.name}”</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-text-2" htmlFor={nameId}>
                Name
              </Label>
              <Input
                disabled={pending || !worktree}
                id={nameId}
                onChange={(event) => setName(event.target.value)}
                placeholder={worktree?.folder ?? ''}
                value={name}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-text-2" htmlFor={worktreeId}>
                Worktree
              </Label>
              <Combobox
                autoHighlight
                disabled={pending || !worktree}
                isItemEqualToValue={(a: WorktreeItem, b: WorktreeItem) => a.absolutePath === b.absolutePath}
                items={worktrees}
                itemToStringLabel={(item: WorktreeItem) => item.folder}
                onValueChange={(item: WorktreeItem | null) => {
                  if (item) {
                    setSelected(item.absolutePath);
                  }
                }}
                value={worktree}
              >
                <ComboboxTrigger className="w-full" id={worktreeId}>
                  <ComboboxValue />
                  {worktree && worktree.branch !== worktree.folder && (
                    <span className="text-sm text-text-3">{worktree.branch || 'detached'}</span>
                  )}
                </ComboboxTrigger>
                <ComboboxContent align="start">
                  <ComboboxInput placeholder="Search" />
                  <ComboboxEmpty>No worktrees found</ComboboxEmpty>
                  <ComboboxList>
                    {(item: WorktreeItem) => (
                      <ComboboxItem key={item.absolutePath} value={item}>
                        <span className="min-w-0 flex-1 truncate">{item.folder}</span>
                        {item.branch !== item.folder && (
                          <span className="text-sm text-text-3">{item.branch || 'detached'}</span>
                        )}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {worktrees.length === 0 && (
                <div className="flex h-6 items-center text-sm text-text-2">
                  <p>
                    No worktrees to import ·{' '}
                    <Button
                      className="h-auto p-0 text-sm"
                      onClick={() => {
                        sidebar.importWorkspaceDialog.replaceWith(sidebar.newWorkspaceDialog, {
                          project: id,
                          name: name.trim() || undefined,
                        });
                      }}
                      type="button"
                      variant="link"
                    >
                      New workspace
                    </Button>
                  </p>
                </div>
              )}
            </div>
          </div>
          {error && (
            <div className="text-sm" role="alert">
              {error instanceof TransportError && error.code === Code.ALREADY_EXISTS ? (
                <p className="text-error">A workspace named “{failedName}” already exists.</p>
              ) : (
                <>
                  <p className="text-error">Could not import the workspace</p>
                  <p className="text-text-3">{error.message}</p>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose disabled={pending} render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={!worktree} pending={pending} type="submit">
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    )
  );
}
