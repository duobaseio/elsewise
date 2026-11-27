import { DockTabHeader } from '@elsewise/components/components/dock';
import { Icon } from '@elsewise/components/components/icon';
import { toast } from '@elsewise/components/components/toast';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { useEffect } from 'react';
import { useApplicationManager } from '@/application-context';
import { useTerminalManager } from '@/terminals/terminal-manager';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

/**
 * A terminal's header, titled with its name, whose close button closes the terminal.
 */
export function TerminalHeader(props: Pick<IDockviewPanelHeaderProps<{ session?: string }>, 'api' | 'params'>) {
  const { daemon, project, workspace } = route.useParams();
  const { docks } = useApplicationManager();
  const { session } = props.params;
  const name = useTerminalManager((manager) =>
    session === undefined ? undefined : manager.get({ daemon, project, workspace, session })?.session.name,
  );

  useEffect(() => {
    if (name !== undefined && name !== props.api.title) {
      props.api.setTitle(name);
    }
  }, [name, props.api]);

  return (
    <DockTabHeader
      icon={<Icon className="size-4 shrink-0 text-text-3" name="terminal" />}
      title={props.api.title}
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
  );
}
