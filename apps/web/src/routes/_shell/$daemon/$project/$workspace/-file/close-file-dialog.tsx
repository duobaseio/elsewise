import { Button } from '@elsewise/components/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@elsewise/components/components/dialog';
import { useEffect } from 'react';
import { useApplicationManager } from '@/application-context';

/**
 * The dialog that asks what to do with a file that could not be saved before its panel closes, opened through the
 * file handles. It is closed with `cancel` if it goes away without an action.
 */
export function CloseFileDialog() {
  const { files } = useApplicationManager();

  useEffect(() => () => files.closeCloseDialog('cancel'), [files]);

  return (
    <Dialog
      handle={files.closeDialog}
      onOpenChange={(open) => {
        if (!open) {
          files.closeCloseDialog('cancel');
        }
      }}
    >
      {({ payload }) => {
        if (payload === undefined) {
          return null;
        }

        const name = payload.file.relativePath.split('/').at(-1);
        return (
          <DialogContent className="max-w-md" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>
                {payload.failure === null ? `Overwrite “${name}”?` : `Close “${name}” without saving?`}
              </DialogTitle>
              <DialogDescription>
                {payload.failure === null
                  ? 'This file was changed by something else while you were editing it.'
                  : 'Your unsaved changes will be lost.'}
              </DialogDescription>
            </DialogHeader>
            {payload.failure !== null && (
              <div className="text-sm" role="alert">
                <p className="text-error">{`Could not save “${name}”`}</p>
                <p className="text-text-3">{payload.failure}</p>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => files.closeCloseDialog('cancel')} variant="outline">
                Cancel
              </Button>
              <Button onClick={() => files.closeCloseDialog('discard')} variant="destructive">
                Don’t save
              </Button>
              {payload.failure === null && (
                <Button onClick={() => files.closeCloseDialog('overwrite')}>Overwrite</Button>
              )}
            </DialogFooter>
          </DialogContent>
        );
      }}
    </Dialog>
  );
}
