import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { useApplicationManager } from '@/application-context';
import { DraggableTab } from './draggable-tab';

/**
 * A panel's tab, which shows the header of the panel's component and makes the panel draggable by it.
 */
export function Tab(props: IDockviewPanelHeaderProps) {
  const { panelComponents } = useApplicationManager().docks;
  const type = props.api.tabComponent;
  const component = panelComponents.find((other) => other.type === type);

  return (
    <>
      {(type === 'fileTree' || (type === 'custom' && props.params?.tab !== true)) && <span data-tabless hidden />}
      {type !== 'placeholder' && <DraggableTab api={props.api} />}
      {component && <component.header api={props.api} params={props.params} />}
    </>
  );
}
