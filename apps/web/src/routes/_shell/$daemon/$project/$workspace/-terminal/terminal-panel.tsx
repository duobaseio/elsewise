import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import type { TerminalView } from '@elsewise/frontend-plugin';
import { getRouteApi } from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { Terminal } from '@/terminals/terminal';

import { usePanelFocus } from '../-dock/panel';

const route = getRouteApi('/_shell/$daemon/$project/$workspace');

export function TerminalPanel(props: IDockviewPanelProps<{ session?: string }>) {
  const { daemon, project, workspace } = route.useParams();
  const { terminals } = useApplicationManager();
  const { session } = props.params;
  const [view, setView] = useState<TerminalView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (session === undefined || failure !== null) {
      return undefined;
    }

    let mounted = true;
    terminals
      .open({ daemon, project, workspace, session })
      .then((opened) => {
        if (!mounted) {
          return;
        }

        if (opened === null) {
          props.api.close();
        } else {
          setView(opened);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      });

    const subscription = terminals.onClose((view) => {
      if (view.session.id.daemon === daemon && view.session.id.session === session) {
        props.api.close();
      }
    });

    return () => {
      mounted = false;
      void subscription();
    };
  }, [terminals, daemon, project, workspace, session, failure, props.api]);

  usePanelFocus(view === null ? null : () => view.terminal.focus());

  if (failure !== null) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-5 text-destructive" name="error" />
            <h2 className="font-display text-display-sm">Couldn't open the terminal</h2>
          </div>
          <p className="max-w-[80ch] font-mono text-code text-text-3 wrap-break-word">{failure}</p>
          <Button className="mt-1" onClick={() => setFailure(null)} size="sm" variant="secondary">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return view === null ? null : <Terminal xterm={view.terminal} session={view.session.id} />;
}
