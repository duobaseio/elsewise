import type { ComponentProps } from 'react';

import type { WorkTreeDock } from '@/routes/_shell/$project/$worktree';

type DockPanels = NonNullable<ComponentProps<typeof WorkTreeDock>['panels']>;

// Minimal stand-ins for the dock's panels. Tests exercise the dock's chrome and policies, not panel content — stubs
// keep them (and the screenshot baselines) stable while the real panels evolve.
export const STUB_PANELS: DockPanels = {
  editor: () => <p className="p-2 text-base text-text-3">editor stub</p>,
  terminal: () => <p className="p-2 text-base text-text-3">terminal stub</p>,
  fileTree: () => <p className="p-2 text-base text-text-3">tree stub</p>,
};
