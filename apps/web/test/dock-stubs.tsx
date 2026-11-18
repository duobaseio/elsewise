import type { ComponentProps } from 'react';

import type { WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';

type DockPanels = NonNullable<ComponentProps<typeof WorkspaceDock>['panels']>;
type DockTabs = NonNullable<ComponentProps<typeof WorkspaceDock>['tabs']>;

// Minimal stand-ins for the dock's panels. Tests exercise the dock's chrome and policies, not panel content — stubs
// keep them (and the screenshot baselines) stable while the real panels evolve.
export const STUB_PANELS: DockPanels = {
  editor: () => <p className="p-2 text-base text-text-3">editor stub</p>,
  terminal: () => <p className="p-2 text-base text-text-3">terminal stub</p>,
  fileTree: () => <p className="p-2 text-base text-text-3">tree stub</p>,
};

// Stand-ins for the tabs, which otherwise need the workspace's route and the application around the dock.
export const STUB_TABS: DockTabs = {
  fileTree: () => <span className="px-2 text-base">Files</span>,
  terminal: (props) => <span className="px-2 text-base">{props.api.title}</span>,
};
