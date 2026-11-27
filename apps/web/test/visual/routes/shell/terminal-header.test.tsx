import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { DockviewPanelApi } from 'dockview-react';
import { expect, onTestFinished, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { ApplicationManagerContext } from '@/application-context';
import { TerminalHeader } from '@/routes/_shell/$daemon/$project/$workspace/-terminal/terminal-header';
import { TerminalManager } from '@/terminals/terminal-manager';
import { builtInApplication } from '../../../commands';
import { THEMES } from '../../../sheet';

const SESSION = { daemon: 'local', project: 'elsewise', workspace: 'singapore', session: 'a' };

test.each(THEMES)('terminal header while session is renamed (%s)', async (theme) => {
  // The popover is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <div
        className="bg-background p-4 font-sans text-foreground"
        data-brightness={theme}
        data-testid="sheet"
        style={{ width: 320, height: 180 }}
      >
        {/* Stands in for the tab, which the popover is placed against. */}
        <div className="dv-tab h-8 w-fit">
          <TerminalHeader
            api={{ id: 'terminal:a', title: 'Terminal', setTitle() {} } as unknown as DockviewPanelApi}
            params={{ session: SESSION.session }}
          />
        </div>
      </div>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([workspace])]),
    history: createMemoryHistory({ initialEntries: ['/local/elsewise/singapore'] }),
  });
  const terminals = new TerminalManager(new QueryClient());
  await render(
    <ApplicationManagerContext value={builtInApplication({ router, terminals })}>
      <RouterProvider router={router} />
    </ApplicationManagerContext>,
  );
  await expect.element(page.getByText('Terminal')).toBeVisible();

  terminals.renaming = SESSION;
  await expect.element(page.getByRole('textbox', { name: 'Session name' })).toHaveFocus();
  await new Promise((resolve) => setTimeout(resolve, 300));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`terminal-header-renaming-${theme}`);
});
