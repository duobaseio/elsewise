import { toast } from '@elsewise/components/components/toast';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { useEffect } from 'react';
import { useApplicationManager } from '@/application-context';
import { useTerminalManager } from '@/terminal/terminal-manager';
import { DefaultTab } from '../route';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

/**
 * A terminal's tab, titled with its name, whose close button closes the terminal.
 */
export function TerminalTab(props: IDockviewPanelHeaderProps<{ session?: string }>) {
  const { daemon, project, workspace } = route.useParams();
  const { terminals } = useApplicationManager();
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
    <DefaultTab
      {...props}
      onClose={() => {
        if (session === undefined) {
          props.api.close();
          return;
        }

        terminals
          .delete({ daemon, project, workspace, session })
          .catch((error: Error) =>
            toast.add({ type: 'error', title: 'Deleting the terminal failed', description: error.message }),
          );
      }}
    />
  );
}
