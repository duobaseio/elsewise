import type { IDockviewPanelHeaderProps, IDockviewPanelProps } from 'dockview-react';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { isCustomPanel } from '@/dock/dock-store';
import { PluginBoundary } from '@/plugins/plugin-boundary';
import { DraggableTab } from '../-dock/draggable-tab';

/**
 * A custom panel's tab, which renders the header of the panel's source once that source is added.
 */
export function CustomTab(props: IDockviewPanelHeaderProps<{ tab?: boolean }>) {
  const custom = useCustomPanel(props.api.id);

  return (
    <>
      {props.params.tab !== true && <span data-tabless hidden />}
      <DraggableTab api={props.api} />
      {custom && (
        <PluginBoundary name={`Header of panel source ${custom.source.id}`}>
          <custom.source.header application={custom.application} dock={custom.dock} panel={custom.panel} />
        </PluginBoundary>
      )}
    </>
  );
}

/**
 * A custom panel, which renders the panel of its source once that source is added.
 */
export function CustomPanelContent(props: IDockviewPanelProps) {
  const custom = useCustomPanel(props.api.id);

  return (
    custom && (
      <PluginBoundary name={`Panel of panel source ${custom.source.id}`}>
        <custom.source.panel application={custom.application} dock={custom.dock} panel={custom.panel} />
      </PluginBoundary>
    )
  );
}

function useCustomPanel(id: string) {
  const application = useApplicationManager();
  const { docks } = application;
  const subscribe = useCallback(
    (listener: () => void) => {
      const disposables = [docks.onChange(listener), docks.onPanelSourcesChange(listener)];
      return () => {
        for (const dispose of disposables) {
          void dispose();
        }
      };
    },
    [docks],
  );
  const dock = useSyncExternalStore(subscribe, () => docks.active);
  const panel = useSyncExternalStore(subscribe, () => docks.active?.get(id) ?? null);
  const source = useSyncExternalStore(
    subscribe,
    () => docks.panelSources.find((other) => other.id === panel?.type) ?? null,
  );

  return dock === null || panel === null || !isCustomPanel(panel) || source === null
    ? null
    : { application, dock, panel, source };
}
