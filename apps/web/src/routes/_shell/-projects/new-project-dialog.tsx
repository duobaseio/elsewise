import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Button } from '@elsewise/components/components/button';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
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
import { type CloneProgress, DEFAULT_ROUTES, type RepositoryItem } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { type ComponentType, Fragment, useEffect, useId, useRef, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { PluginBoundary } from '@/plugins/plugin-boundary';

interface Creation {
  readonly daemon: string;
  readonly name: string;
  readonly url: string;
}

interface Section {
  readonly value: string;
  readonly icon: ComponentType | null;
  readonly label: string | null;
  readonly items: readonly RepositoryItem[];
}

const PHASES: Record<CloneProgress['phase'], string> = {
  enumerating: 'Enumerating objects',
  counting: 'Counting objects',
  compressing: 'Compressing objects',
  receiving: 'Receiving objects',
  resolving: 'Resolving deltas',
  unpacking: 'Unpacking objects',
  'checking-out': 'Checking out files',
  other: 'Cloning',
};

/**
 * The dialog that creates a project on a daemon, empty or cloned, opened through the sidebar's dialog handle. It stays
 * open until the project is added, then opens its main workspace. Closing it while cloning stops the clone.
 */
export function NewProjectDialog() {
  const { projects, router, sidebar } = useApplicationManager();
  const [opening, setOpening] = useState(0);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const cloning = useRef<AbortController | null>(null);

  const create = useMutation({
    mutationFn: async ({ daemon, name, url }: Creation) => {
      const controller = new AbortController();
      cloning.current = url === '' ? null : controller;
      try {
        const project =
          url === ''
            ? await projects.add(daemon, { type: 'new', name })
            : await projects.clone(
                daemon,
                { url, name: name || undefined },
                { onProgress: setProgress, signal: controller.signal },
              );
        return (await projects.workspaces.list(project.id)).find((workspace) => workspace.main);
      } finally {
        cloning.current = null;
        setProgress(null);
      }
    },
    onSuccess: (main) => {
      sidebar.newProjectDialog.close();
      if (main) {
        void router.navigate({ href: DEFAULT_ROUTES.workspace(main.id.daemon, main.id.project, main.id.workspace) });
      }
    },
  });

  return (
    <Dialog
      handle={sidebar.newProjectDialog}
      onOpenChange={(next, details) => {
        if (create.isPending && details.reason !== 'imperative-action') {
          if (cloning.current) {
            cloning.current.abort();
          } else {
            details.cancel();
          }
        } else if (next) {
          create.reset();
          setOpening((count) => count + 1);
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <NewProjectForm
            key={`${payload.daemon}/${opening}`}
            failed={create.variables ?? null}
            pending={create.isPending}
            progress={create.isPending && create.variables?.url ? (progress ?? { phase: 'other', percent: 0 }) : null}
            error={create.error}
            onCreate={(creation) => create.mutate({ daemon: payload.daemon, ...creation })}
          />
        )
      }
    </Dialog>
  );
}

function NewProjectForm({
  failed,
  pending,
  progress,
  error,
  onCreate,
}: {
  failed: Creation | null;
  pending: boolean;
  progress: CloneProgress | null;
  error: Error | null;
  onCreate: (creation: Omit<Creation, 'daemon'>) => void;
}) {
  const nameId = useId();
  const repositoryId = useId();
  const [name, setName] = useState('');
  const [repository, setRepository] = useState('');
  const [picked, setPicked] = useState<RepositoryItem | null>(null);

  const query = repository.trim();
  const url = picked?.url ?? (/^([a-z+]+:\/\/|[\w.-]+@[\w.-]+:)\S+$/.test(query) ? query : '');
  const suggested =
    (picked?.name ?? url)
      .split('/')
      .at(-1)
      ?.replace(/\.git$/, '') ?? '';
  const ready = query === '' ? name.trim() !== '' : url !== '';
  const host = failed?.url.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)/)?.[1];

  return (
    <DialogContent className="max-w-md" showCloseButton={false}>
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) {
            onCreate({ name: name.trim(), url });
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-text-2" htmlFor={nameId}>
              Name
            </Label>
            <Input
              id={nameId}
              onChange={(event) => setName(event.target.value)}
              placeholder={suggested}
              readOnly={pending}
              value={name}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-text-2" htmlFor={repositoryId}>
              Repository
            </Label>
            <RepositoryInput
              id={repositoryId}
              value={repository}
              picked={picked}
              url={url}
              readOnly={pending}
              onChange={(next) => {
                setRepository(next);
                setPicked(null);
              }}
              onPick={(item) => {
                setRepository(item.name);
                setPicked(item);
              }}
            />
            {/* TODO: Show the folder the project goes in, and let it be chosen, once daemon settings are exposed. */}
            {progress && (
              <div className="mt-0.5 flex h-6 flex-col justify-center gap-1 text-sm text-text-2" role="status">
                <div className="flex justify-between">
                  <span>{PHASES[progress.phase]}</span>
                  <span className="text-text-3">{progress.percent}%</span>
                </div>
                <div className="h-0.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full bg-foreground" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
        {error && (
          <div className="text-sm" role="alert">
            {error instanceof TransportError && error.code === Code.FAILED_PRECONDITION && host ? (
              <>
                <p className="text-error">Could not sign in to {host}</p>
                <p className="text-text-3">{error.message}</p>
              </>
            ) : (
              <>
                <p className="text-error">Could not create the project</p>
                <p className="text-text-3">{error.message}</p>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={!ready} pending={pending} type="submit">
            Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RepositoryInput({
  id,
  value,
  picked,
  url,
  readOnly,
  onChange,
  onPick,
}: {
  id: string;
  value: string;
  picked: RepositoryItem | null;
  url: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onPick: (item: RepositoryItem) => void;
}) {
  const { projects } = useApplicationManager();
  const [open, setOpen] = useState(false);
  const query = value.trim();
  const [search, setSearch] = useState(query);
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query), 150);
    return () => clearTimeout(timeout);
  }, [query]);
  const sections: Section[] = (
    useQuery({
      queryKey: ['repository-sources', search],
      queryFn: ({ signal }) => projects.searchRepositories(search, { signal }),
      enabled: open,
      placeholderData: keepPreviousData,
    }).data ?? []
  ).map((group) => ({ value: group.id, icon: group.icon ?? null, label: group.label ?? null, items: group.items }));
  const shown = open && (sections.length > 0 || !picked);
  const PickedIcon = picked?.icon;

  return (
    <Combobox
      filter={null}
      inputValue={value}
      isItemEqualToValue={(a: RepositoryItem, b: RepositoryItem) => a.url === b.url}
      items={sections}
      itemToStringLabel={(item: RepositoryItem) => item.name}
      onInputValueChange={(next, details) => {
        if (details.reason === 'input-change') {
          onChange(next);
        }
      }}
      readOnly={readOnly}
      open={shown}
      onOpenChange={setOpen}
      value={picked}
      onValueChange={(item: RepositoryItem | null) => {
        if (item) {
          onPick(item);
        }
      }}
    >
      <div className="relative">
        {PickedIcon && (
          <span className="pointer-events-none absolute top-2 left-2.5 flex size-4 items-center justify-center">
            <PluginBoundary name={`Repository icon ${picked.url}`}>
              <PickedIcon />
            </PluginBoundary>
          </span>
        )}
        <ComboboxPrimitive.Input
          id={id}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && shown) {
              event.preventDefault();
            }
          }}
          placeholder="None, or paste a URL"
          render={<Input className={PickedIcon ? 'pr-8 pl-8' : 'pr-8'} />}
        />
        {value !== '' && (
          <Button
            aria-label="Clear repository"
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
          {(section: Section, index: number) => (
            <Fragment key={section.value}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup items={section.items}>
                {section.label !== null && (
                  <ComboboxLabel className="flex items-center gap-2">
                    {section.icon && (
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <PluginBoundary name={`Repository group icon ${section.value}`}>
                          <section.icon />
                        </PluginBoundary>
                      </span>
                    )}
                    {section.label}
                  </ComboboxLabel>
                )}
                <ComboboxCollection>
                  {(item: RepositoryItem) => {
                    const ItemIcon = item.icon;
                    const at = query === '' ? -1 : item.name.indexOf(query);
                    return (
                      <ComboboxItem key={item.url} value={item}>
                        {ItemIcon && (
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            <PluginBoundary name={`Repository icon ${item.url}`}>
                              <ItemIcon />
                            </PluginBoundary>
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {at === -1 ? (
                            item.name
                          ) : (
                            <>
                              {item.name.slice(0, at)}
                              <span className="font-medium">{query}</span>
                              {item.name.slice(at + query.length)}
                            </>
                          )}
                        </span>
                      </ComboboxItem>
                    );
                  }}
                </ComboboxCollection>
              </ComboboxGroup>
            </Fragment>
          )}
        </ComboboxList>
        {!picked && (
          <div className="flex h-6.5 shrink-0 items-center gap-1.5 border-t px-2.5 text-text-2 text-xs tracking-[0.01em]">
            {url === '' ? (
              'Paste a repository’s URL to clone it'
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">Clone “{url}”</span>
                <Kbd binding="Enter" className="translate-y-px" />
              </>
            )}
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
