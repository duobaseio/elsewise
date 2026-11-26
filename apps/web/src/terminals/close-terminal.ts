import type { ClosablePanel } from '@elsewise/frontend-plugin';
import type { ApplicationManager } from '@/application-manager';
import type { DockManager } from '@/dock/dock-manager';

/**
 * Deletes a terminal before its panel closes, and returns whether the panel may close.
 *
 * It asks first if the panel has close confirmation and the terminal's program runs.
 */
export async function closeTerminal(
  { terminals }: ApplicationManager,
  _dock: DockManager,
  panel: ClosablePanel,
): Promise<boolean> {
  if (panel.type !== 'terminal') {
    return true;
  }

  const session = panel.closeConfirmation ? await terminals.store.get(panel.session) : null;
  if (session?.state === 'running' && !(await terminals.openCloseDialog(session))) {
    return false;
  }

  await terminals.delete(panel.session);
  return true;
}
