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
 * The dialog that asks whether to close a terminal whose program runs, opened through the terminals. It is closed
 * unconfirmed if it goes away before it is confirmed.
 */
export function CloseTerminalDialog() {
  const { terminals } = useApplicationManager();

  useEffect(() => () => terminals.closeCloseDialog(false), [terminals]);

  return (
    <Dialog
      handle={terminals.closeDialog}
      onOpenChange={(open) => {
        if (!open) {
          terminals.closeCloseDialog(false);
        }
      }}
    >
      {({ payload }) =>
        payload && (
          <DialogContent className="max-w-md" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{`Close “${payload.name}”?`}</DialogTitle>
              <DialogDescription>This terminal’s running program will stop.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => terminals.closeCloseDialog(false)} variant="outline">
                Cancel
              </Button>
              <Button onClick={() => terminals.closeCloseDialog(true)} variant="destructive">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )
      }
    </Dialog>
  );
}
