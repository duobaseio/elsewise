import type { ClosablePanel } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import type { ApplicationManager } from '@/application-manager';
import type { DockManager } from '@/dock/dock-manager';

export async function closeFile(
  { files }: ApplicationManager,
  dock: DockManager,
  panel: ClosablePanel,
): Promise<boolean> {
  const file = panel.type === 'file' ? files.get(dock.workspaceId, panel.relativePath) : null;
  if (file === null || file.document === null) {
    return true;
  }

  let failure: unknown;
  try {
    await file.save(file.document());
    return true;
  } catch (error) {
    failure = error;
  }

  // TODO: Should a hash mismatch return a different error code?
  if (failure instanceof TransportError && failure.code === Code.FAILED_PRECONDITION) {
    const action = await files.openCloseDialog(file, null);
    if (action === 'discard') {
      return true;
    }

    if (action === 'cancel') {
      return false;
    }

    try {
      await file.save(file.document(), { overwrite: true });
      return true;
    } catch (error) {
      failure = error;
    }
  }

  const action = await files.openCloseDialog(file, failure instanceof Error ? failure.message : String(failure));
  return action === 'discard';
}
