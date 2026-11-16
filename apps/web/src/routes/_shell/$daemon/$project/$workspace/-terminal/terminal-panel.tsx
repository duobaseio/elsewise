import { toast } from '@elsewise/components/components/toast';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useMemo, useRef } from 'react';
import { daemonQuery } from '@/daemon';
import { Terminal } from '@/terminal/terminal';
import { TerminalAttachment } from '@/terminal/terminal-attachment';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

export function TerminalPanel(props: IDockviewPanelProps<{ terminalId?: string }>) {
  const { daemon, workspace } = route.useParams();
  const { terminalId } = props.params;
  const client = useQuery(daemonQuery(daemon)).data;
  const creating = useRef(false);

  useEffect(() => {
    if (client === undefined || terminalId !== undefined || creating.current) {
      return;
    }

    creating.current = true;
    client.terminals
      .createTerminal({ workspaceId: workspace })
      .then(({ terminal }) => {
        if (terminal !== undefined) {
          props.api.updateParameters({ terminalId: terminal.id });
          props.api.setTitle(terminal.name);
        }
      })
      .catch((error: Error) =>
        toast.add({ type: 'error', title: 'Creating the terminal failed', description: error.message }),
      );
  }, [client, terminalId, workspace, props.api]);

  const attachment = useMemo(() => {
    if (client === undefined || terminalId === undefined) {
      return null;
    }

    return new TerminalAttachment(client.terminals, terminalId, () => props.api.close());
  }, [client, terminalId, props.api]);

  return attachment === null ? null : <Terminal session={attachment} />;
}
