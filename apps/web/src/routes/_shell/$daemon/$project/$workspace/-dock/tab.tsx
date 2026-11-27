import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { type ReactNode, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { useDockContextMenu } from '@/dock/docks-manager';
import { DraggableTab } from './draggable-tab';

/**
 * A panel's tab, which shows the header of the panel's component with the dock's context menu and the component's
 * tooltip, and makes the panel draggable by it.
 */
export function Tab(props: IDockviewPanelHeaderProps) {
  const application = useApplicationManager();
  const { docks } = application;
  const subscribe = useCallback((listener: () => void) => docks.onChange(listener), [docks]);
  const panel = useSyncExternalStore(subscribe, () => docks.active?.get(props.api.id) ?? null);
  const menu = useDockContextMenu();

  const [tooltip, setTooltip] = useState<{ open: boolean; content: ReactNode }>({ open: false, content: null });
  const trigger = useRef<HTMLDivElement>(null);

  const type = props.api.tabComponent;
  const component = docks.panelComponents.find((other) => other.type === type);
  const previous = useRef<Element | null>(null);

  return (
    <>
      {(type === 'fileTree' || (type === 'custom' && props.params?.tab !== true)) && <span data-tabless hidden />}
      {type !== 'placeholder' && <DraggableTab api={props.api} />}
      {component &&
        (type === 'placeholder' ? (
          <component.header api={props.api} params={props.params} />
        ) : (
          <Tooltip
            open={tooltip.open}
            onOpenChange={(open, details) => {
              if (!open) {
                setTooltip({ ...tooltip, open });
                return;
              }

              const dock = docks.active;
              const content =
                !application.settings.frontend.workspace.tabTooltips ||
                details.reason === 'trigger-focus' ||
                dock === null ||
                panel === null
                  ? null
                  : (component.tooltip?.(application, dock, panel) ?? null);

              if (content !== null) {
                setTooltip({ open, content });
              } else {
                details.cancel();
              }
            }}
          >
            {/* The tab pads its content, which the menu's trigger covers too. */}
            <CommandContextMenu
              menu={menu}
              target={{ current: panel }}
              onClosed={() => {
                if (previous.current instanceof HTMLElement && previous.current.isConnected) {
                  previous.current.focus();
                }
              }}
              render={
                <TooltipTrigger
                  delay={600}
                  render={
                    <div
                      onPointerDownCapture={() => {
                        previous.current = document.activeElement;
                      }}
                      ref={trigger}
                    />
                  }
                />
              }
              className="-my-1 box-content h-full py-1"
            >
              {/* biome-ignore lint/a11y/noStaticElementInteractions: a click on the tab selects it, which dockview does. */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: as above. */}
              <div
                className="contents"
                onClick={() => docks.requestPanelFocus(props.api.id)}
                onFocus={() => setTooltip({ ...tooltip, open: false })}
              >
                <component.header api={props.api} params={props.params} />
              </div>
            </CommandContextMenu>
            <TooltipContent
              className="max-w-none"
              side="bottom"
              align="start"
              anchor={() => trigger.current?.closest('.dv-tab') ?? trigger.current}
            >
              {tooltip.content}
            </TooltipContent>
          </Tooltip>
        ))}
    </>
  );
}
