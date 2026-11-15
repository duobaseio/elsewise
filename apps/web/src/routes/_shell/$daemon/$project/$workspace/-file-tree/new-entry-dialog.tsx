import { Button } from '@elsewise/components/components/button';
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
import type { Workspace } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { daemonQuery } from '@/daemon';

interface NewEntry {
  readonly workspace: Workspace;
  readonly kind: 'file' | 'folder';
  readonly path: string;
}

export function NewEntryDialog() {
  const { fileTree } = useApplicationManager();
  const client = useQueryClient();
  const [opening, setOpening] = useState(0);
  const [failure, setFailure] = useState<Error | null>(null);

  const add = useMutation({
    mutationFn: async ({ workspace, kind, path }: NewEntry) => {
      const daemon = await client.query(daemonQuery(workspace.id.daemon));
      const request = { root: workspace.absolutePath, relativePath: path };
      await (kind === 'file' ? daemon.fileSystem.writeFile(request) : daemon.fileSystem.createDirectory(request));
    },
    // TODO: Open the new file in its editor.
    onSuccess: () => fileTree.newDialog.close(),
    onError: (error) => setFailure(error),
  });

  return (
    <Dialog
      handle={fileTree.newDialog}
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
          <NewEntryForm
            key={opening}
            workspace={payload.workspace}
            folder={payload.folder}
            kind={payload.kind}
            name={payload.name}
            pending={add.isPending}
            error={failure}
            onCreate={(entry) => {
              setFailure(null);
              add.mutate(entry);
            }}
          />
        )
      }
    </Dialog>
  );
}

function NewEntryForm({
  workspace,
  folder,
  kind,
  name: initialName,
  pending,
  error,
  onCreate,
}: {
  workspace: Workspace;
  folder: string;
  kind: 'file' | 'folder';
  name: string | undefined;
  pending: boolean;
  error: Error | null;
  onCreate: (entry: NewEntry) => void;
}) {
  const { fileTree } = useApplicationManager();
  const nameId = useId();
  const [name, setName] = useState(initialName ?? '');
  const [invalid, setInvalid] = useState<string | null>(null);

  const folderPath = folder.replace(/\/$/, '');
  const folderName = folderPath === '' ? workspace.name : folderPath;
  const trimmed = name.trim();
  const fileName =
    kind === 'folder' && /^[^.].*\.(?=[A-Za-z0-9]{1,10}$)\d*[A-Za-z]/.test(trimmed.split('/').at(-1) ?? '');

  return (
    <DialogContent className="max-w-md" showCloseButton={false}>
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed.includes('\\')) {
            setInvalid('Names cannot contain “\\”.');
            return;
          }

          const segments = trimmed.split('/').filter((segment) => segment !== '');
          onCreate({ workspace, kind, path: [folderPath, ...segments].filter((part) => part !== '').join('/') });
        }}
      >
        <DialogHeader>
          <DialogTitle>{`New ${kind} in “${folderName}”`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label className="text-text-2" htmlFor={nameId}>
            Name
          </Label>
          <Input
            id={nameId}
            onChange={(event) => {
              setName(event.target.value);
              setInvalid(null);
            }}
            readOnly={pending}
            value={name}
          />
          {kind === 'folder' && (
            <div className="flex h-6 items-center text-sm text-text-2">
              {fileName && (
                <p>
                  Did you mean to{' '}
                  <Button
                    className="h-auto p-0 text-sm underline"
                    onClick={() => {
                      if (!pending) {
                        fileTree.newDialog.replaceWith(fileTree.newDialog, { workspace, folder, kind: 'file', name });
                      }
                    }}
                    type="button"
                    variant="link"
                  >
                    create a file
                  </Button>{' '}
                  instead?
                </p>
              )}
            </div>
          )}
        </div>
        {(invalid ?? error) !== null && (
          <div className="text-sm" role="alert">
            {invalid !== null ? (
              <p className="text-error">{invalid}</p>
            ) : error instanceof TransportError && error.code === Code.ALREADY_EXISTS ? (
              <p className="text-error">{`“${trimmed}” already exists in “${folderName}”.`}</p>
            ) : (
              error !== null && (
                <>
                  <p className="text-error">{`Could not create “${trimmed}”`}</p>
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
          <Button disabled={trimmed === ''} pending={pending} type="submit">
            Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
