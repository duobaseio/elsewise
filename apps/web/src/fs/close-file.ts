import type { ClosablePanel } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import type { ApplicationManager } from '@/application-manager';
import type { DockManager } from '@/dock/dock-manager';

export async function closeFile(
  { files }: ApplicationManager,
  dock: DockManager,
  panel: ClosablePanel,
): Promise<boolean> {
  // document needs to be a separate variable because TS has fucking shit unsound control flow analysis. It assumes that
  // the file.document property can never be null after an initial check :)
  const file = panel.type === 'file' ? files.get(dock.workspaceId, panel.relativePath) : null;
  let document = file?.document ?? null;
  if (file === null || document === null) {
    return true;
  }

  let failure: unknown;
  try {
    let saved: string;
    do {
      saved = document();
      await file.save(saved);
      document = file.document;
    } while (document !== null && document() !== saved);
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

    document = file.document;
    if (document === null) {
      return true;
    }

    try {
      let saved: string;
      do {
        saved = document();
        await file.save(saved, { overwrite: true });
        document = file.document;
      } while (document !== null && document() !== saved);
      return true;
    } catch (error) {
      failure = error;
    }
  }

  const action = await files.openCloseDialog(file, failure instanceof Error ? failure.message : String(failure));
  return action === 'discard';
}
