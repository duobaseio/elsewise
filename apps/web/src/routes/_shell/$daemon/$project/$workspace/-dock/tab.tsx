import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { useDockContextMenu } from '@/dock/docks-manager';
import { DraggableTab } from './draggable-tab';

/**
 * A panel's tab, which shows the header of the panel's component with the dock's context menu, and makes the panel
 * draggable by it.
 */
export function Tab(props: IDockviewPanelHeaderProps) {
  const { docks } = useApplicationManager();
  const subscribe = useCallback((listener: () => void) => docks.onChange(listener), [docks]);
  const panel = useSyncExternalStore(subscribe, () => docks.active?.get(props.api.id) ?? null);
  const menu = useDockContextMenu();
  const type = props.api.tabComponent;
  const component = docks.panelComponents.find((other) => other.type === type);

  return (
    <>
      {(type === 'fileTree' || (type === 'custom' && props.params?.tab !== true)) && <span data-tabless hidden />}
      {type !== 'placeholder' && <DraggableTab api={props.api} />}
      {component &&
        (type === 'placeholder' ? (
          <component.header api={props.api} params={props.params} />
        ) : (
          // The tab pads its content, which the menu's trigger covers too.
          <CommandContextMenu
            menu={menu}
            target={{ current: panel }}
            onClosed={() => {}}
            className="-my-1 box-content h-full py-1"
          >
            <component.header api={props.api} params={props.params} />
          </CommandContextMenu>
        ))}
    </>
  );
}
