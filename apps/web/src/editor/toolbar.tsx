import type { Extension } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { Button } from '@elsewise/components/components/button';
import { Kbd } from '@elsewise/components/components/kbd';
import { Toggle } from '@elsewise/components/components/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@elsewise/components/components/tooltip';
import {
  type ApplicationCommand,
  DEFAULT_EDITOR_TOOLBAR,
  type EditorCommand,
  type EditorToolbarItem,
  type EditorToolbarProps,
} from '@elsewise/plugin';
import {
  Component,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useCommandManager } from '@/command/command-manager';
import { CompareToolbarItem } from '@/editor/diff/compare';
import { useEditorManager } from '@/editor/editor-manager';
import { DiagnosticsSummary } from '@/editor/scrollbar-markers/diagnostics-summary';

interface Mounted extends EditorToolbarProps {
  dom: HTMLElement;
}

type Entry =
  | {
      readonly type: 'command';
      readonly id: string;
      readonly order: number;
      readonly command: ApplicationCommand | EditorCommand;
      readonly icon: ComponentType<ComponentProps<'svg'>>;
    }
  | {
      readonly type: 'component';
      readonly id: string;
      readonly order: number;
      readonly component: ComponentType<EditorToolbarProps>;
    };

// The built-in items.
const BUILT_IN: readonly EditorToolbarItem[] = [
  {
    type: 'component',
    order: DEFAULT_EDITOR_TOOLBAR.diagnostics,
    id: 'io.duobase.elsewise.editor.toolbar.diagnostics',
    component: DiagnosticsSummary,
  },
  {
    type: 'component',
    order: DEFAULT_EDITOR_TOOLBAR.diff,
    id: 'io.duobase.elsewise.editor.toolbar.compare',
    component: CompareToolbarItem,
  },
];

/**
 * Returns the extension that shows the toolbar at the editor's top right, and the portal that renders it.
 *
 * The toolbar shows the built-in items and the plugins' items.
 */
export function useToolbarExtension(): { toolbar: Extension; portal: ReactNode } {
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const toolbar = useMemo(
    () =>
      ViewPlugin.define((view) => {
        const dom = view.dom.appendChild(document.createElement('div'));
        dom.className = 'cm-toolbar';
        const listeners = new Set<(update: ViewUpdate) => void>();
        const measure = {
          read: () => view.scrollDOM.offsetTop,
          write: (top: number) => {
            dom.style.top = `${top}px`;
          },
        };
        view.requestMeasure(measure);
        setMounted({
          view,
          dom,
          subscribe: (listener) => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        });

        return {
          update(update) {
            if (update.geometryChanged) {
              update.view.requestMeasure(measure);
            }
            for (const listener of listeners) {
              try {
                listener(update);
              } catch (error) {
                console.error('Toolbar listener failed', error);
              }
            }
          },
          destroy() {
            dom.remove();
            setMounted(null);
          },
        };
      }),
    [],
  );

  const portal = mounted && createPortal(<Toolbar view={mounted.view} subscribe={mounted.subscribe} />, mounted.dom);
  return { toolbar, portal };
}

/**
 * The toolbar, whose tooltips are one group.
 */
function Toolbar({ view, subscribe }: EditorToolbarProps) {
  const added = useEditorManager((editor) => editor.toolbarItems);
  const commands = useCommandManager();
  const registered = useCommandManager((commands) => commands.commands);
  const keys = useCommandManager((commands) => commands.keymap.commands);
  const [states, setStates] = useState<ReadonlyMap<string, { enabled: boolean; active?: boolean }>>(new Map());

  const entries = useMemo(() => {
    const entries: Entry[] = [];
    const ids = new Set<string>();
    for (const item of [...BUILT_IN, ...added]) {
      const id = item.type === 'component' ? item.id : item.command;
      if (ids.has(id)) {
        console.warn(`Toolbar item ${id} was already added`);
        continue;
      }

      ids.add(id);
      const order = item.order ?? Number.POSITIVE_INFINITY;
      if (item.type === 'component') {
        entries.push({ type: 'component', id, order, component: item.component });
        continue;
      }

      const command = registered.get(item.command);
      if (command === undefined) {
        console.warn(`Unknown command ${item.command} in toolbar`);
      } else if (command.scope === 'terminal') {
        console.warn(`Terminal command ${item.command} in editor toolbar`);
      } else {
        entries.push({ type: 'command', id: command.id, order, command, icon: item.icon });
      }
    }
    // From left to right, so the focus moves in the order the items are seen.
    return entries.sort((a, b) => b.order - a.order || b.id.localeCompare(a.id));
  }, [added, registered]);

  useEffect(() => {
    const evaluate = () => {
      const next = new Map<string, { enabled: boolean; active?: boolean }>();
      for (const entry of entries) {
        if (entry.type !== 'command') {
          continue;
        }

        const { command } = entry;
        try {
          const shown =
            command.scope === 'application'
              ? command.shown?.(commands.application)
              : command.shown?.(commands.application, view);
          const enabled =
            command.scope === 'application'
              ? command.enabled?.(commands.application)
              : command.enabled?.(commands.application, view);
          const active =
            command.scope === 'application'
              ? command.active?.(commands.application)
              : command.active?.(commands.application, view);
          if (shown !== false) {
            next.set(command.id, { enabled: enabled !== false, active });
          }
        } catch (error) {
          console.error(`Command ${command.label} failed`, error);
        }
      }
      setStates((previous) =>
        previous.size === next.size &&
        [...next].every(
          ([id, state]) => previous.get(id)?.enabled === state.enabled && previous.get(id)?.active === state.active,
        )
          ? previous
          : next,
      );
    };

    evaluate();
    return subscribe(evaluate);
  }, [entries, commands, view, subscribe]);

  return (
    <TooltipProvider>
      <div className="flex h-6 items-center gap-0.5 font-sans text-sm" data-slot="toolbar">
        {entries.map((entry) => {
          if (entry.type === 'component') {
            return (
              <ItemBoundary key={`component:${entry.id}`} id={entry.id}>
                <entry.component view={view} subscribe={subscribe} />
              </ItemBoundary>
            );
          }

          const { command, icon: Glyph } = entry;
          const key = keys.get(command.id)?.[0];
          const state = states.get(command.id);
          return (
            state !== undefined && (
              <Tooltip key={`command:${command.id}`}>
                <TooltipTrigger
                  render={
                    state.active === undefined ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        // Sizes the icon like the diagnostics summary's, unless it has its own size.
                        className="size-5 text-muted-foreground hover:text-foreground"
                        aria-label={command.label}
                        disabled={!state.enabled}
                        // Keeps focus in the editor, so the command runs from its selection.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => commands.run(command.id, view)}
                      />
                    ) : (
                      <Toggle
                        size="xs"
                        className="size-5 min-w-5 px-0"
                        aria-label={command.label}
                        pressed={state.active}
                        disabled={!state.enabled}
                        onMouseDown={(event) => event.preventDefault()}
                        onPressedChange={() => commands.run(command.id, view)}
                      />
                    )
                  }
                >
                  <Glyph />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {command.label}
                  {key && <Kbd binding={key} />}
                </TooltipContent>
              </Tooltip>
            )
          );
        })}
      </div>
    </TooltipProvider>
  );
}

class ItemBoundary extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(`Toolbar item ${this.props.id} failed`, error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
