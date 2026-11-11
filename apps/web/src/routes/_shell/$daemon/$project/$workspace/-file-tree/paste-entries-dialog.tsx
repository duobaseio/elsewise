import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from '@elsewise/components/components/autocomplete';
import { Button } from '@elsewise/components/components/button';
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
import { Label } from '@elsewise/components/components/label';
import { toast } from '@elsewise/components/components/toast';
import type { Workspace } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import { absolutePath } from '@/fs/commands';
import type { FileTreeClipboard } from '@/fs/file-tree-manager';
import { type PasteEntry, pasteEntry } from '@/fs/paste';
import { DirectoryListing_Entry_Type } from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';

interface Paste {
  readonly workspace: Workspace;
  readonly folder: string;
  readonly cut: boolean;
  readonly single: boolean;
  readonly entries: readonly PasteEntry[];
}

export function PasteEntriesDialog() {
  const { fileTree } = useApplicationManager();
  const client = useQueryClient();
  const [opening, setOpening] = useState(0);
  const [failure, setFailure] = useState<Error | null>(null);

  const paste = useMutation({
    mutationFn: async ({ workspace, cut, entries }: Paste) => {
      const daemon = await client.query(daemonQuery(workspace.id.daemon));
      const conflicting: PasteEntry[] = [];
      const failures: { entry: PasteEntry; error: Error }[] = [];
      for (const entry of entries) {
        try {
          await pasteEntry(daemon, workspace, cut, entry, false);
        } catch (error) {
          if (error instanceof TransportError && error.code === Code.ALREADY_EXISTS) {
            conflicting.push(entry);
          } else {
            failures.push({ entry, error: error instanceof Error ? error : new Error(String(error)) });
          }
        }
      }
      return { conflicting, failures };
    },
    onSuccess: ({ conflicting, failures }, { workspace, folder, cut, single }) => {
      const [failed] = failures;
      if (single && failed !== undefined) {
        setFailure(failed.error);
        return;
      }

      for (const { entry, error } of failures) {
        toast.add({
          type: 'error',
          title: `${cut ? 'Moving' : 'Copying'} “${name(entry.source)}” failed`,
          description: error.message,
        });
      }

      if (cut) {
        fileTree.clipboard = null;
      }

      if (conflicting.length > 0) {
        fileTree.pasteDialog.replaceWith(fileTree.overwriteDialog, { workspace, folder, cut, entries: conflicting });
      } else {
        fileTree.pasteDialog.close();
      }
    },
    onError: (error) => setFailure(error),
  });

  return (
    <Dialog
      handle={fileTree.pasteDialog}
      onOpenChange={(next, details) => {
        if (paste.isPending && details.reason !== 'imperative-action') {
          details.cancel();
        } else if (next) {
          setFailure(null);
          setOpening((count) => count + 1);
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <PasteEntriesForm
            key={opening}
            workspace={payload.workspace}
            folder={payload.folder}
            clipboard={payload.clipboard}
            pending={paste.isPending}
            error={failure}
            onPaste={(request) => {
              setFailure(null);
              paste.mutate(request);
            }}
          />
        )
      }
    </Dialog>
  );
}

function PasteEntriesForm({
  workspace,
  folder: initialFolder,
  clipboard,
  pending,
  error,
  onPaste,
}: {
  workspace: Workspace;
  folder: string;
  clipboard: FileTreeClipboard;
  pending: boolean;
  error: Error | null;
  onPaste: (paste: Paste) => void;
}) {
  const { platform } = useApplicationManager();
  const nameId = useId();
  const folderId = useId();
  const focused = useRef(false);
  const sources = clipboard.paths.filter(
    (path) => !clipboard.paths.some((other) => other !== path && other.endsWith('/') && path.startsWith(other)),
  );
  const [first = ''] = sources;
  const single = sources.length === 1;
  const [newName, setNewName] = useState(name(first));
  const [folder, setFolder] = useState(initialFolder);
  const [invalid, setInvalid] = useState<string | null>(null);

  const folderPath = folder.trim().replace(/^\/+|\/+$/g, '');
  const folderName = folderPath === '' ? workspace.name : folderPath;
  const verb = clipboard.cut ? 'Move' : 'Copy';
  const folders = sources.filter((path) => path.endsWith('/')).length;
  const kinds = folders === 0 ? 'files' : folders === sources.length ? 'folders' : 'files and folders';
  const browsable = workspace.id.daemon === LOCAL_DAEMON_ID && window.bridge?.window?.pickPaths !== undefined;

  return (
    <DialogContent className="max-w-md" showCloseButton={false}>
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          const separator = /[/\\]/.exec(newName)?.[0];
          if (single && separator !== undefined) {
            setInvalid(`Names cannot contain “${separator}”.`);
            return;
          }

          const entries = sources.map((path) => {
            const source = path.replace(/\/$/, '');
            const destination = [folderPath, single ? newName.trim() : name(path)].filter((part) => part !== '');
            return { source, destination: destination.join('/'), folder: path.endsWith('/') };
          });
          const unmoved = entries.find((entry) => entry.source === entry.destination);
          if (unmoved !== undefined && (single || !clipboard.cut)) {
            setInvalid(
              clipboard.cut
                ? `“${name(unmoved.source)}” is already in “${folderName}”.`
                : `“${name(unmoved.source)}” already exists in “${folderName}”.`,
            );
            return;
          }

          onPaste({
            workspace,
            folder: folderName,
            cut: clipboard.cut,
            single,
            entries: entries.filter((entry) => entry.source !== entry.destination),
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {single
              ? `${verb} “${name(first)}” ${first.endsWith('/') ? 'folder' : 'file'}`
              : `${verb} ${sources.length} ${kinds}`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {single && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-text-2" htmlFor={nameId}>
                New name
              </Label>
              <Input
                id={nameId}
                onFocus={(event) => {
                  if (!focused.current) {
                    focused.current = true;
                    const dot = newName.lastIndexOf('.');
                    event.currentTarget.setSelectionRange(0, dot > 0 && !first.endsWith('/') ? dot : newName.length);
                  }
                }}
                onChange={(event) => {
                  setNewName(event.target.value);
                  setInvalid(null);
                }}
                readOnly={pending}
                value={newName}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="text-text-2" htmlFor={folderId}>
              To folder
            </Label>
            <FolderInput
              id={folderId}
              workspace={workspace}
              value={folder}
              readOnly={pending}
              onChange={(next) => {
                setFolder(next);
                setInvalid(null);
              }}
              onBrowse={
                browsable
                  ? async () => {
                      const [picked] = await platform.pickPaths({
                        kind: 'folder',
                        defaultPath: absolutePath(workspace, folderPath),
                        createFolder: true,
                      });
                      if (picked === undefined) {
                        return;
                      }

                      const root = workspace.absolutePath.replace(/[\\/]$/, '');
                      if (picked === root) {
                        setFolder('');
                        setInvalid(null);
                      } else if (picked.startsWith(`${root}/`) || picked.startsWith(`${root}\\`)) {
                        setFolder(`${picked.slice(root.length + 1).replaceAll('\\', '/')}/`);
                        setInvalid(null);
                      } else {
                        setInvalid(`Pick a folder in “${workspace.name}”.`);
                      }
                    }
                  : undefined
              }
            />
          </div>
        </div>
        {(invalid ?? error) !== null && (
          <div className="text-sm" role="alert">
            {invalid !== null ? (
              <p className="text-error">{invalid}</p>
            ) : (
              error !== null && (
                <>
                  <p className="text-error">
                    Could not {verb.toLowerCase()} {single ? `“${name(first)}”` : `${sources.length} ${kinds}`}
                  </p>
                  <p className="text-text-3">{error.message}</p>
                </>
              )
            )}
          </div>
        )}
        <DialogFooter>
          <DialogClose disabled={pending} render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={single && newName.trim() === ''} pending={pending} type="submit">
            {verb}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function FolderInput({
  id,
  workspace,
  value,
  readOnly,
  onChange,
  onBrowse,
}: {
  id: string;
  workspace: Workspace;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onBrowse: (() => void) | undefined;
}) {
  const [highlighted, setHighlighted] = useState<string | undefined>();
  const parent = value.slice(0, value.lastIndexOf('/') + 1);
  const prefix = value.slice(parent.length);
  const listing = useQuery({
    queryKey: ['daemons', workspace.id.daemon, 'directories', workspace.absolutePath, parent],
    queryFn: async ({ client }) => {
      const daemon = await client.query(daemonQuery(workspace.id.daemon));
      return daemon.fileSystem.listDirectory({ root: workspace.absolutePath, relativePath: parent.replace(/\/$/, '') });
    },
    select: (response) => response.listing,
    retry: false,
  });

  const folders = (listing.data?.entries ?? [])
    .filter((entry) => entry.type === DirectoryListing_Entry_Type.DIRECTORY)
    .filter((entry) => entry.name.toLowerCase().startsWith(prefix.toLowerCase()))
    .map((entry) => `${parent}${entry.name}/`);
  const missing =
    value.trim() !== '' &&
    (prefix === ''
      ? listing.isError
      : listing.isSuccess && !listing.data?.entries.some((entry) => entry.name === prefix));
  const truncated = listing.data?.truncated ?? 0;
  const completion =
    value === ''
      ? undefined
      : [highlighted, folders[0]].find(
          (folder) =>
            folder !== undefined &&
            folder.length > value.length &&
            folder.toLowerCase().startsWith(value.toLowerCase()),
        );

  return (
    <Autocomplete
      autoHighlight
      filter={null}
      items={folders}
      onItemHighlighted={(folder, details) => {
        if (details.reason !== 'pointer') {
          setHighlighted(folder);
        }
      }}
      onValueChange={onChange}
      openOnInputClick
      readOnly={readOnly}
      value={value}
    >
      <div className="relative">
        <AutocompleteInput
          className={onBrowse ? 'pr-8' : undefined}
          id={id}
          onKeyDown={(event) => {
            const end = event.currentTarget.selectionStart === value.length;
            const accepts = (event.key === 'Tab' && !event.shiftKey) || (event.key === 'ArrowRight' && end);
            if (accepts && completion !== undefined) {
              event.preventDefault();
              onChange(completion);
            }
          }}
          placeholder="Workspace root"
        />
        {onBrowse && (
          <Button
            aria-label="Browse"
            className="absolute top-1 right-1 text-text-3"
            onClick={() => {
              if (!readOnly) {
                onBrowse();
              }
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Icon name="folder" />
          </Button>
        )}
      </div>
      <AutocompleteContent>
        <AutocompleteList>
          {(folder: string) => (
            <AutocompleteItem key={folder} value={folder}>
              <span className="min-w-0 flex-1 truncate">
                {parent}
                <span className="font-medium">{folder.slice(parent.length, parent.length + prefix.length)}</span>
                {folder.slice(parent.length + prefix.length)}
              </span>
            </AutocompleteItem>
          )}
        </AutocompleteList>
        {(missing || truncated > 0) && (
          <div className="flex h-6.5 shrink-0 items-center gap-1.5 border-t px-2.5 text-text-2 text-xs tracking-[0.01em]">
            <span className="min-w-0 flex-1 truncate">
              {missing ? `New folder “${value.trim().replace(/\/+$/, '')}”` : `${truncated} more not shown`}
            </span>
          </div>
        )}
      </AutocompleteContent>
    </Autocomplete>
  );
}

function name(path: string): string {
  return path.replace(/\/$/, '').split('/').at(-1) ?? path;
}
