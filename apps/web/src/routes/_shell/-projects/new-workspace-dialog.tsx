import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Button } from '@elsewise/components/components/button';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from '@elsewise/components/components/combobox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@elsewise/components/components/dialog';
import { Icon } from '@elsewise/components/components/icon';
import { Input } from '@elsewise/components/components/input';
import { Kbd } from '@elsewise/components/components/kbd';
import { Label } from '@elsewise/components/components/label';
import { DEFAULT_ROUTES, type NewWorkspace, type ProjectId } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Fragment, useId, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { daemonQuery } from '@/daemon';
import { refsQuery } from '@/git/refs';
import { projectsQuery } from '@/projects/project-manager';
import { workspacesQuery } from '@/projects/workspace-manager';

interface Section<T> {
  readonly value: string;
  readonly label: string | null;
  readonly items: readonly T[];
}

interface BranchItem {
  readonly label: string;
  readonly remote: string;
  readonly checkedOut: { readonly workspace: string } | { readonly worktree: string } | null;
}

interface BaseItem {
  readonly value: string;
  readonly label: string;
  readonly remote: string;
}

/**
 * The dialog that creates a workspace in a project, opened with the project's id through the sidebar's dialog handle.
 * It stays open until the workspace is added, then opens it.
 */
export function NewWorkspaceDialog() {
  const { projects, router, sidebar } = useApplicationManager();
  const [opening, setOpening] = useState(0);
  const [failure, setFailure] = useState<{ error: Error; name: string } | null>(null);

  const add = useMutation({
    mutationFn: ({ project, source }: { project: ProjectId; source: NewWorkspace }) =>
      projects.workspaces.add(project, source),
    onError: (error, { source }) => setFailure({ error, name: source.name ?? '' }),
    onSuccess: ({ id }) => {
      setFailure(null);
      sidebar.newWorkspaceDialog.close();
      void router.navigate({ href: DEFAULT_ROUTES.workspace(id.daemon, id.project, id.workspace) });
    },
  });

  return (
    <Dialog
      handle={sidebar.newWorkspaceDialog}
      onOpenChange={(next, details) => {
        if (add.isPending && details.reason !== 'imperative-action') {
          details.cancel();
        } else if (next) {
          setFailure(null);
          setOpening((count) => count + 1);
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <NewWorkspaceForm
            key={`${payload.project.daemon}/${payload.project.project}/${opening}`}
            id={payload.project}
            initialName={payload.name ?? ''}
            failedName={failure?.name ?? ''}
            opening={opening}
            pending={add.isPending}
            error={failure?.error ?? null}
            onAdd={(source) => add.mutate({ project: payload.project, source })}
          />
        )
      }
    </Dialog>
  );
}

function NewWorkspaceForm({
  id,
  initialName,
  failedName,
  opening,
  pending,
  error,
  onAdd,
}: {
  id: ProjectId;
  initialName: string;
  opening: number;
  pending: boolean;
  error: Error | null;
  failedName: string;
  onAdd: (source: NewWorkspace) => void;
}) {
  const { sidebar } = useApplicationManager();
  const nameId = useId();
  const branchId = useId();
  const [name, setName] = useState(initialName);
  const [branch, setBranch] = useState('');
  const [base, setBase] = useState('');

  const project = useQuery({
    ...projectsQuery(id.daemon),
    select: (projects) => projects.find((other) => other.id === id.project),
  }).data;
  const workspaces = useQuery(workspacesQuery(id.daemon, id.project)).data ?? [];
  const absolutePath = project?.absolutePath ?? '';
  const refs = useQuery(refsQuery(id.daemon, absolutePath)).data;
  const generated =
    useQuery({
      queryKey: ['daemons', id.daemon, 'projects', id.project, 'new-workspace-name', opening],
      queryFn: async ({ client }) => {
        const daemon = await client.query(daemonQuery(id.daemon));
        return daemon.projects.getNewWorkspaceName({ projectId: id.project });
      },
      select: (response) => response.name,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 0,
    }).data ?? '';

  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.absolutePath, workspace.name]));
  const refBranches = refs?.branches ?? [];
  const branches = [
    ...new Map(
      refBranches.toReversed().map((other) => {
        const label = other.remote === '' ? other.name : other.name.slice(other.remote.length + 1);
        const workspace = workspaceNames.get(other.worktreeAbsolutePath);
        const checkedOut =
          other.worktreeAbsolutePath === ''
            ? null
            : workspace === undefined
              ? { worktree: other.worktreeAbsolutePath }
              : { workspace };
        return [label, { label, remote: other.remote, checkedOut } satisfies BranchItem];
      }),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const bases: Section<BaseItem>[] = [
    ...sectionsByRemote(
      refBranches
        .map((other) => ({
          value: other.name,
          label: other.remote === '' ? other.name : other.name.slice(other.remote.length + 1),
          remote: other.remote,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ),
    {
      value: 'tags',
      label: 'Tags',
      items: (refs?.tags ?? [])
        .map((tag) => ({ value: tag.name, label: tag.name, remote: '' }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    },
  ].filter((section) => section.items.length > 0);
  const head = refs?.worktrees.find((worktree) => worktree.main);

  const query = branch.trim();
  const match = branches.find((item) => item.label === query);
  const usedWorkspace =
    match?.checkedOut != null && 'workspace' in match.checkedOut ? match.checkedOut.workspace : null;
  const usedWorktree = match?.checkedOut != null && 'worktree' in match.checkedOut ? match.checkedOut.worktree : null;

  return (
    project && (
      <DialogContent className="max-w-md" showCloseButton={false}>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(
              match
                ? {
                    type: 'new',
                    name: name.trim() || generated,
                    branch: match.label,
                    base: match.remote === '' ? '' : `${match.remote}/${match.label}`,
                  }
                : { type: 'new', name: name.trim() || generated, branch: query, base },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>New workspace in “{project.name}”</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-text-2" htmlFor={nameId}>
                Name
              </Label>
              <Input
                id={nameId}
                onChange={(event) => setName(event.target.value)}
                placeholder={generated}
                readOnly={pending}
                value={name}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-text-2" htmlFor={branchId}>
                Branch
              </Label>
              <BranchInput id={branchId} branches={branches} value={branch} readOnly={pending} onChange={setBranch} />
              <div className="flex h-6 items-center text-sm text-text-2">
                {usedWorkspace !== null && <p>Already in {usedWorkspace}</p>}
                {usedWorktree !== null && (
                  <p>
                    Already in a worktree ·{' '}
                    <Button
                      className="h-auto p-0 text-sm"
                      onClick={() => {
                        if (pending) {
                          return;
                        }
                        sidebar.newWorkspaceDialog.replaceWith(sidebar.importWorkspaceDialog, {
                          project: id,
                          absolutePath: usedWorktree,
                          name: name.trim() || undefined,
                        });
                      }}
                      type="button"
                      variant="link"
                    >
                      Import workspace
                    </Button>
                  </p>
                )}
                {!match && (
                  <p>
                    New branch from{' '}
                    <BasePicker
                      sections={bases}
                      head={head?.branch || head?.hash.slice(0, 7) || 'HEAD'}
                      value={base}
                      readOnly={pending}
                      onChange={setBase}
                    />
                  </p>
                )}
              </div>
            </div>
          </div>
          {error && (
            <div className="text-sm" role="alert">
              {error instanceof TransportError && error.code === Code.ALREADY_EXISTS ? (
                <p className="text-error">A workspace named “{failedName}” already exists.</p>
              ) : (
                <>
                  <p className="text-error">Could not create the workspace</p>
                  <p className="text-text-3">{error.message}</p>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button disabled={usedWorkspace !== null || usedWorktree !== null} pending={pending} type="submit">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    )
  );
}

function BranchInput({
  id,
  branches,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  branches: readonly BranchItem[];
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim();
  const match = branches.find((item) => item.label === query);
  const sections = sectionsByRemote(branches.filter((item) => item.label.includes(query) && item.checkedOut === null));
  const shown = open && (sections.length > 0 || !match);

  return (
    <Combobox
      filter={null}
      inputValue={value}
      isItemEqualToValue={(a: BranchItem, b: BranchItem) => a.label === b.label}
      items={sections}
      itemToStringLabel={(item: BranchItem) => item.label}
      onInputValueChange={(next, details) => {
        if (details.reason === 'input-change') {
          onChange(next);
        }
      }}
      readOnly={readOnly}
      open={shown}
      onOpenChange={setOpen}
      value={match ?? null}
      onValueChange={(item: BranchItem | null) => {
        if (item) {
          onChange(item.label);
        }
      }}
    >
      <div className="relative">
        <ComboboxPrimitive.Input
          id={id}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && shown) {
              event.preventDefault();
            }
          }}
          placeholder="Same as name"
          render={<Input className="pr-8" />}
        />
        {value !== '' && (
          <Button
            aria-label="Clear branch"
            className="absolute top-1 right-1 text-text-3"
            onClick={() => {
              if (!readOnly) {
                onChange('');
              }
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        )}
      </div>
      <ComboboxContent align="start">
        <ComboboxEmpty />
        <ComboboxList>
          {(section: Section<BranchItem>, index: number) => (
            <Fragment key={section.value}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup items={section.items}>
                {section.label !== null && <ComboboxLabel>{section.label}</ComboboxLabel>}
                <ComboboxCollection>
                  {(item: BranchItem) => {
                    const at = item.label.indexOf(query);
                    return (
                      <ComboboxItem key={item.label} value={item}>
                        <span className="min-w-0 flex-1 truncate">
                          {item.label.slice(0, at)}
                          <span className="font-medium">{query}</span>
                          {item.label.slice(at + query.length)}
                        </span>
                      </ComboboxItem>
                    );
                  }}
                </ComboboxCollection>
              </ComboboxGroup>
            </Fragment>
          )}
        </ComboboxList>
        {!match && (
          <div className="flex h-6.5 shrink-0 items-center gap-1.5 border-t px-2.5 text-text-2 text-xs tracking-[0.01em]">
            {query === '' ? (
              'Type a new branch'
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">New branch “{query}”</span>
                <Kbd binding="Enter" className="translate-y-px" />
              </>
            )}
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  );
}

function BasePicker({
  sections,
  head,
  value,
  readOnly,
  onChange,
}: {
  sections: readonly Section<BaseItem>[];
  head: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Combobox
      autoHighlight
      isItemEqualToValue={(a: BaseItem, b: BaseItem) => a.value === b.value}
      items={sections}
      itemToStringLabel={(item: BaseItem) => item.value}
      readOnly={readOnly}
      value={sections.flatMap((section) => section.items).find((item) => item.value === value) ?? null}
      onValueChange={(item: BaseItem | null) => onChange(item?.value ?? '')}
    >
      <ComboboxPrimitive.Trigger aria-label="Base" render={<Button size="xs" type="button" variant="secondary" />}>
        {value || head}
        <Icon className="text-text-3" name="expand" />
      </ComboboxPrimitive.Trigger>
      <ComboboxContent align="start" className="w-72">
        <ComboboxInput placeholder="Search" />
        <ComboboxEmpty>No branches or tags found</ComboboxEmpty>
        <ComboboxList>
          {(section: Section<BaseItem>, index: number) => (
            <Fragment key={section.value}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup items={section.items}>
                {section.label !== null && <ComboboxLabel>{section.label}</ComboboxLabel>}
                <ComboboxCollection>
                  {(item: BaseItem) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            </Fragment>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function sectionsByRemote<T extends { readonly remote: string }>(items: readonly T[]): Section<T>[] {
  const remotes = [...new Set(items.flatMap((item) => (item.remote === '' ? [] : [item.remote])))].sort();
  return [
    { value: 'local', label: null, items: items.filter((item) => item.remote === '') },
    ...remotes.map((remote) => ({
      value: `remote:${remote}`,
      label: remote,
      items: items.filter((item) => item.remote === remote),
    })),
  ].filter((section) => section.items.length > 0);
}
