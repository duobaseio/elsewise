import { DockTabHeader } from '@elsewise/components/components/dock';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import type { PanelComponent } from '@/dock/panel-component';
import { DraggableTab } from '@/routes/_shell/$daemon/$project/$workspace/-dock/draggable-tab';
import { Placeholder, PlaceholderTab } from '@/routes/_shell/$daemon/$project/$workspace/-placeholder/placeholder';

// Minimal stand-ins for the dock's panels and tabs. Tests exercise the dock's chrome and policies, not panel content —
// stubs keep them (and the screenshot baselines) stable while the real panels evolve. The real tabs also need the
// workspace's route around the dock.
export const STUB_COMPONENTS: readonly PanelComponent[] = [
  { type: 'placeholder', tab: PlaceholderTab, panel: Placeholder },
  {
    type: 'file',
    tab: (props) => <span className="px-2 text-base">{props.api.title}</span>,
    panel: () => <p className="p-2 text-base text-text-3">editor stub</p>,
  },
  {
    type: 'terminal',
    tab: (props) => <span className="px-2 text-base">{props.api.title}</span>,
    panel: () => <p className="p-2 text-base text-text-3">terminal stub</p>,
  },
  {
    type: 'fileTree',
    tab: () => <span className="px-2 text-base">Files</span>,
    panel: () => <p className="p-2 text-base text-text-3">tree stub</p>,
  },
];

export function StubTab(props: IDockviewPanelHeaderProps) {
  return (
    <>
      <DraggableTab api={props.api} />
      <DockTabHeader title={props.api.title} onClose={() => props.api.close()} />
    </>
  );
}

export function stubComponents(
  real: Partial<Record<PanelComponent['type'], Partial<Omit<PanelComponent, 'type'>>>>,
): readonly PanelComponent[] {
  return STUB_COMPONENTS.map((stub) => ({ ...stub, ...real[stub.type] }));
}
