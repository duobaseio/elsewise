import { Button } from '@elsewise/components/components/button';
import { Checkbox } from '@elsewise/components/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@elsewise/components/components/dialog';
import { FileIcon } from '@elsewise/components/components/file-icon';
import { Icon } from '@elsewise/components/components/icon';
import { Label } from '@elsewise/components/components/label';
import { toast } from '@elsewise/components/components/toast';
import type { Workspace } from '@elsewise/frontend-plugin';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { daemonQuery } from '@/daemon';
import { type PasteEntry, pasteEntries } from '@/fs/paste';

interface Overwrite {
  readonly workspace: Workspace;
  readonly cut: boolean;
  readonly entries: readonly PasteEntry[];
}

/**
 * The dialog that overwrites the entries a paste found already at their destination, opened through the file tree's
 * overwrite dialog handle. Each entry starts checked; unchecked ones are left as they are.
 */
export function OverwriteEntriesDialog() {
  const { fileTree } = useApplicationManager();
  const client = useQueryClient();
  const [opening, setOpening] = useState(0);

  const overwrite = useMutation({
    mutationFn: async ({ workspace, cut, entries }: Overwrite) => {
      const daemon = await client.query(daemonQuery(workspace.id.daemon));
      const { failures } = await pasteEntries(daemon, workspace, cut, entries, true);

      for (const entry of cut ? entries : []) {
        if (!failures.some((failure) => failure.entry === entry)) {
          const suffix = entry.folder ? '/' : '';
          fileTree.moveClipboardPaths(workspace.id, entry.source + suffix, entry.destination + suffix);
        }
      }

      for (const { entry, error } of failures) {
        toast.add({
          type: 'error',
          title: `${cut ? 'Moving' : 'Copying'} “${name(entry.destination)}” failed`,
          description: error.message,
        });
      }
    },
    onSuccess: () => fileTree.overwriteDialog.close(),
    onError: (error, { cut }) =>
      toast.add({ type: 'error', title: cut ? 'Moving failed' : 'Copying failed', description: error.message }),
  });

  return (
    <Dialog
      handle={fileTree.overwriteDialog}
      onOpenChange={(next, details) => {
        if (overwrite.isPending && details.reason !== 'imperative-action') {
          details.cancel();
        } else if (next) {
          setOpening((count) => count + 1);
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <OverwriteEntriesContent
            key={opening}
            folder={payload.folder}
            entries={payload.entries}
            pending={overwrite.isPending}
            onOverwrite={(entries) => overwrite.mutate({ workspace: payload.workspace, cut: payload.cut, entries })}
            onSkip={() => fileTree.overwriteDialog.close()}
          />
        )
      }
    </Dialog>
  );
}

function OverwriteEntriesContent({
  folder,
  entries,
  pending,
  onOverwrite,
  onSkip,
}: {
  folder: string;
  entries: readonly PasteEntry[];
  pending: boolean;
  onOverwrite: (entries: readonly PasteEntry[]) => void;
  onSkip: () => void;
}) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(entries.map((entry) => entry.source)));
  const [first] = entries;
  const folders = entries.filter((entry) => entry.folder).length;
  const kinds = folders === 0 ? 'files' : folders === entries.length ? 'folders' : 'files and folders';

  return (
    <DialogContent className="max-w-md" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>
          {entries.length === 1
            ? `Overwrite “${name(first?.destination ?? '')}” ${first?.folder ? 'folder' : 'file'}?`
            : `Overwrite ${entries.length} ${kinds}?`}
        </DialogTitle>
        <DialogDescription>
          {entries.length === 1
            ? `“${name(first?.destination ?? '')}” already exists in “${folder}”.`
            : `These ${kinds} already exist in “${folder}”.`}
          {folders > 0 &&
            (entries.length === 1
              ? ' The existing folder’s files and subfolders will be permanently deleted.'
              : ' Overwritten folders’ files and subfolders will be permanently deleted.')}
        </DialogDescription>
      </DialogHeader>
      {entries.length > 1 && (
        <div className="-mx-3 -my-2 flex max-h-52 flex-col gap-2 overflow-y-auto px-3 py-2">
          {entries.map((entry) => (
            <Label key={entry.source}>
              <Checkbox
                checked={checked.has(entry.source)}
                disabled={pending}
                onCheckedChange={(next) => {
                  const updated = new Set(checked);
                  if (next) {
                    updated.add(entry.source);
                  } else {
                    updated.delete(entry.source);
                  }
                  setChecked(updated);
                }}
              />
              {entry.folder ? (
                <Icon name="folder" className="size-4 text-text-3" />
              ) : (
                <FileIcon name={name(entry.destination)} />
              )}
              {name(entry.destination)}
            </Label>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button disabled={pending} onClick={onSkip} variant="outline">
          Skip
        </Button>
        <Button
          disabled={checked.size === 0}
          onClick={() => onOverwrite(entries.filter((entry) => checked.has(entry.source)))}
          pending={pending}
          variant="destructive"
        >
          Overwrite
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function name(path: string): string {
  return path.split('/').at(-1) ?? path;
}
