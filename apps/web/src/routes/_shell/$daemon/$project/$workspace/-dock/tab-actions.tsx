import { Button } from '@elsewise/components/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@elsewise/components/components/dropdown-menu';
import { FileIcon } from '@elsewise/components/components/file-icon';
import { Icon } from '@elsewise/components/components/icon';
import { toast } from '@elsewise/components/components/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { cn } from '@elsewise/components/lib/utils';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApplicationManagerContext } from '@/application-context';

export function TabActions(props: IDockviewHeaderActionsProps) {
  const docks = useContext(ApplicationManagerContext)?.docks;
  const tabbed = useSyncExternalStore(
    (listener) => docks?.onChange(listener) ?? (() => {}),
    () => props.panels.some((panel) => docks?.active?.get(panel.id)?.tab === true),
  );

  const shown = props.activePanel?.id;
  useEffect(() => {
    const strip = props.group.element.querySelector('.dv-tabs-container');
    if (shown === undefined || strip === null) {
      return undefined;
    }

    // The strip narrows once the actions after it show.
    const resizes = new ResizeObserver(() =>
      strip
        .querySelector(`[data-tab-panel-id="${CSS.escape(shown)}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
    resizes.observe(strip);
    return () => resizes.disconnect();
  }, [props.group, shown]);

  if (!tabbed) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex h-full gap-0.5 pt-[3px] pr-0.5 pb-1">
        <AddTabAction {...props} />
        <OverflowTabsAction {...props} />
      </div>
    </TooltipProvider>
  );
}

function AddTabAction(props: IDockviewHeaderActionsProps) {
  const docks = useContext(ApplicationManagerContext)?.docks;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="New tab"
            className="aspect-square size-auto bg-clip-border text-text-3"
            // TODO: Offer each kind of tab instead of always adding a terminal.
            onClick={() => {
              const dock = docks?.active;
              const last = dock?.get(props.panels.at(-1)?.id ?? '');
              if (dock == null || last == null || !last.tab) {
                return;
              }

              dock
                .addTerminal({}, { tab: 'last', with: last })
                .catch((error: Error) =>
                  toast.add({ type: 'error', title: 'Creating the terminal failed', description: error.message }),
                );
            }}
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <Icon className="size-3" name="add" />
      </TooltipTrigger>
      <TooltipContent side="bottom">New tab</TooltipContent>
    </Tooltip>
  );
}

function OverflowTabsAction(props: IDockviewHeaderActionsProps) {
  const docks = useContext(ApplicationManagerContext)?.docks;
  const [overflow, setOverflow] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);
  const focusing = useRef<{ closed: string; next: string | undefined }>(undefined);

  useEffect(() => {
    const strip = props.group.element.querySelector('.dv-tabs-container');
    if (strip === null) {
      return undefined;
    }

    const update = () => {
      // A dragged tab slides through strips that it does not join.
      if (strip.closest('.dv-dockview')?.querySelector('[data-dnd-dragging]') != null) {
        return;
      }

      const { left, right } = strip.getBoundingClientRect();
      const ids: string[] = [];
      for (const tab of strip.querySelectorAll<HTMLElement>('.dv-tab')) {
        const box = tab.getBoundingClientRect();
        const id = tab.dataset.tabPanelId;
        if (id !== undefined && box.width > 0 && (box.left < left - 0.5 || box.right > right + 0.5)) {
          ids.push(id);
        }
      }

      setOverflow((current) =>
        // Fuck TS and their lack of structural list equality.
        current.length === ids.length && current.every((id, index) => id === ids[index]) ? current : ids,
      );

      if (ids.length === 0) {
        setOpen(false);
      }
    };

    const resizes = new ResizeObserver(update);
    const observe = () => {
      resizes.disconnect();
      resizes.observe(strip);
      for (const tab of strip.children) {
        resizes.observe(tab);
      }
    };
    const changes = new MutationObserver(observe);
    changes.observe(strip, { childList: true });
    strip.addEventListener('scroll', update);
    observe();

    return () => {
      resizes.disconnect();
      changes.disconnect();
      strip.removeEventListener('scroll', update);
    };
  }, [props.group]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Show hidden tabs"
                  className={cn(
                    'aspect-square size-auto bg-clip-border text-text-3',
                    overflow.length === 0 && 'invisible',
                  )}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            />
          }
        >
          <Icon className="size-3" name="expand" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Show hidden tabs</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {overflow.map((id) => {
          const dock = docks?.active;
          const panel = dock?.get(id);
          const title = props.panels.find((open) => open.id === id)?.title ?? '';
          if (dock == null || panel == null) {
            return null;
          }

          const close = () => {
            if (panel.closable) {
              // TODO: Log this properly
              dock
                .close(panel)
                .then((closed) => {
                  if (!closed && focusing.current?.closed === id) {
                    focusing.current = undefined;
                  }
                })
                .catch((error: Error) =>
                  toast.add({
                    type: 'error',
                    title: panel.type === 'terminal' ? 'Deleting the terminal failed' : 'Closing the tab failed',
                    description: error.message,
                  }),
                );
            }
          };

          return (
            <DropdownMenuItem
              aria-keyshortcuts={panel.closable ? (PLATFORM === 'mac' ? 'Meta+Backspace' : 'Delete') : undefined}
              key={id}
              onClick={() => {
                dock.activate(panel);
                props.group.element
                  .querySelector(`[data-tab-panel-id="${CSS.escape(id)}"]`)
                  ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
              onKeyDown={(event) => {
                if (PLATFORM === 'mac' ? event.key === 'Backspace' && event.metaKey : event.key === 'Delete') {
                  event.preventDefault();
                  const at = overflow.indexOf(id);
                  focusing.current = { closed: id, next: overflow[at + 1] ?? overflow[at - 1] };
                  close();
                }
              }}
              ref={(node) => {
                if (node !== null && focusing.current?.next === id && !overflow.includes(focusing.current.closed)) {
                  focusing.current = undefined;
                  node.focus();
                }
              }}
            >
              {/* TODO: Use the panel component's icon and title once a panel component has them. */}
              {panel.type === 'file' && (
                <FileIcon
                  className="text-(--icon-tint-light)! **:text-inherit! dark:text-(--icon-tint-dark)!"
                  name={title}
                />
              )}
              {panel.type === 'terminal' && <Icon className="text-text-3" name="terminal" />}
              <span className="flex-1 truncate">{title}</span>
              {panel.closable && (
                <Button
                  aria-label={`Close ${title}`}
                  className="-mr-0.5 size-4 opacity-0 group-data-highlighted/dropdown-menu-item:opacity-100"
                  nativeButton={false}
                  onClick={(event) => {
                    event.stopPropagation();
                    close();
                  }}
                  render={<span />}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Icon className="size-3 text-text-3! **:text-inherit!" name="close" />
                </Button>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
