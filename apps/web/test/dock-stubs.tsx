import { DockTabHeader } from '@elsewise/components/components/dock';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import type { PanelComponent } from '@/dock/panel-component';
import {
  CustomHeader,
  CustomPanelContent,
  customTooltip,
} from '@/routes/_shell/$daemon/$project/$workspace/-custom/custom-panel';
import { Placeholder, PlaceholderHeader } from '@/routes/_shell/$daemon/$project/$workspace/-placeholder/placeholder';

// Minimal stand-ins for the dock's panels and headers. Tests exercise the dock's chrome and policies, not panel
// content — stubs keep them (and the screenshot baselines) stable while the real panels evolve. The real headers also
// need the workspace's route around the dock.
export const STUB_COMPONENTS: readonly PanelComponent[] = [
  { type: 'placeholder', header: PlaceholderHeader, panel: Placeholder },
  {
    type: 'file',
    header: StubHeader,
    panel: () => <p className="p-2 text-base text-text-3">editor stub</p>,
  },
  {
    type: 'terminal',
    header: StubHeader,
    panel: () => <p className="p-2 text-base text-text-3">terminal stub</p>,
  },
  {
    type: 'fileTree',
    header: () => <span className="px-2 text-base">Files</span>,
    panel: () => <p className="p-2 text-base text-text-3">tree stub</p>,
  },
  { type: 'custom', header: CustomHeader, tooltip: customTooltip, panel: CustomPanelContent },
];

function StubHeader(props: Pick<IDockviewPanelHeaderProps, 'api'>) {
  return <DockTabHeader title={props.api.title} onClose={() => props.api.close()} />;
}

export function stubComponents(
  real: Partial<Record<PanelComponent['type'], Partial<Omit<PanelComponent, 'type'>>>>,
): readonly PanelComponent[] {
  return STUB_COMPONENTS.map((stub) => ({ ...stub, ...real[stub.type] }));
}
