import { DockTabHeader } from '@elsewise/components/components/dock';
import { Icon } from '@elsewise/components/components/icon';
import { Kbd } from '@elsewise/components/components/kbd';
import { Popover, PopoverContent, PopoverTitle } from '@elsewise/components/components/popover';
import { toast } from '@elsewise/components/components/toast';
import type { Panel } from '@elsewise/frontend-plugin';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useApplicationManager } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { NameInput } from '@/components/name-input';
import type { DockManager } from '@/dock/dock-manager';
import { sameSession, useTerminalManager } from '@/terminals/terminal-manager';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

/**
 * A terminal's header, titled with its name, whose close button closes the terminal. While the session is renamed, a
 * popover below the tab has the field.
 */
export function TerminalHeader(props: Pick<IDockviewPanelHeaderProps<{ session?: string }>, 'api' | 'params'>) {
  const { daemon, project, workspace } = route.useParams();
  const { docks, terminals } = useApplicationManager();
  const { session } = props.params;
  const name = useTerminalManager((manager) =>
    session === undefined ? undefined : manager.get({ daemon, project, workspace, session })?.session.name,
  );
  const renaming = useTerminalManager(
    ({ renaming }) =>
      session !== undefined && sameSession(renaming ?? undefined, { daemon, project, workspace, session }),
  );
  const title = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (name !== undefined && name !== props.api.title) {
      props.api.setTitle(name);
    }
  }, [name, props.api]);

  return (
    <>
      <DockTabHeader
        icon={<Icon className="size-4 shrink-0 text-text-3" name="terminal" />}
        title={<span ref={title}>{name ?? props.api.title}</span>}
        onClose={() => {
          if (session === undefined) {
            props.api.close();
            return;
          }

          const panel = docks.active?.get(props.api.id);
          if (panel == null || !panel.closable) {
            return;
          }

          docks.active
            ?.close(panel)
            .catch((error: Error) =>
              toast.add({ type: 'error', title: 'Deleting the terminal failed', description: error.message }),
            );
        }}
      />
      {session !== undefined && (
        <Popover
          open={renaming}
          onOpenChange={(open) => {
            if (!open) {
              terminals.renaming = null;
            }
          }}
        >
          <PopoverContent
            align="start"
            anchor={() => title.current?.closest('.dv-tab') ?? title.current}
            className="w-56 gap-2 p-2"
            finalFocus={false}
            // The popover is a child of the tab, whose context menu its events would open.
            onContextMenu={(event) => event.stopPropagation()}
            side="bottom"
          >
            <PopoverTitle className="text-xs">Rename session</PopoverTitle>
            <NameInput
              label="Session name"
              name={name ?? props.api.title ?? ''}
              onCancel={() => {
                terminals.renaming = null;
                terminals.get({ daemon, project, workspace, session })?.terminal.focus();
              }}
              onRename={(renamed) => {
                terminals.renaming = null;
                terminals.get({ daemon, project, workspace, session })?.terminal.focus();
                terminals
                  .rename({ daemon, project, workspace, session }, renamed)
                  .catch((error: Error) =>
                    toast.add({ type: 'error', title: 'Renaming the session failed', description: error.message }),
                  );
              }}
            />
            <p className="text-text-2 text-xs">
              <Kbd binding="Enter" /> rename · <Kbd binding="Escape" /> cancel
            </p>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

export function terminalTooltip({ terminals }: ApplicationManager, _dock: DockManager, panel: Panel): ReactNode | null {
  if (panel.type !== 'terminal') {
    return null;
  }

  const { renaming } = terminals;
  const name = terminals.get(panel.session)?.session.name;
  return name === undefined || sameSession(renaming ?? undefined, panel.session) ? null : (
    <span className="whitespace-nowrap">{name}</span>
  );
}
