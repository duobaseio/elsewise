import { Button } from '@elsewise/components/components/button';
import { Icon, type IconName } from '@elsewise/components/components/icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Creates the containers of revert buttons, which the merge view places itself, and releases them once it removes them.
 */
export interface RevertButtons {
  container(action: (event: MouseEvent) => void): HTMLElement;
  release(dom: Node): void;
}

interface Revert {
  readonly key: number;
  readonly action: (event: MouseEvent) => void;
}

/**
 * Returns the revert buttons' containers, and the portals that render the buttons into them, with `icon`.
 */
export function useRevertButtons(icon: IconName): { buttons: RevertButtons; portal: ReactNode } {
  const [reverts, setReverts] = useState<ReadonlyMap<HTMLElement, Revert>>(new Map());
  const count = useRef(0);

  const buttons = useMemo<RevertButtons>(
    () => ({
      container: (action) => {
        const dom = document.createElement('div');
        dom.className = 'cm-revert';
        const key = count.current++;
        setReverts((previous) => new Map(previous).set(dom, { key, action }));
        return dom;
      },
      release: (dom) => setReverts((previous) => new Map([...previous].filter(([other]) => other !== dom))),
    }),
    [],
  );

  const portal = (
    <TooltipProvider>
      {[...reverts].map(([dom, { key, action }]) =>
        createPortal(
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  aria-label="Revert change"
                  // A span, since the merge view styles every button in its controls.
                  nativeButton={false}
                  render={<span />}
                  onMouseDown={(event) => {
                    if (event.button === 0) {
                      action(event.nativeEvent);
                    }
                  }}
                />
              }
            >
              <Icon name={icon} className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom">Revert change</TooltipContent>
          </Tooltip>,
          dom,
          String(key),
        ),
      )}
    </TooltipProvider>
  );

  return { buttons, portal };
}
