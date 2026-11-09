import { DEFAULT_ROUTES } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { userThemesQuery } from '@/appearance/themes';
import { userKeymapsQuery } from '@/command/keymap/keymap';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { projectLayoutQuery } from '@/projects/layout';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { type FileRouteTypes, routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

// A route's params become `${string}`, so a path function's return type matches its route.
type Pattern<T extends string> = T extends `${infer Head}$${string}/${infer Tail}`
  ? `${Head}${string}/${Pattern<Tail>}`
  : T extends `${infer Head}$${string}`
    ? `${Head}${string}`
    : T;
type Routes = {
  readonly [key: string]: Routes | FileRouteTypes['to'] | ((...args: string[]) => Pattern<FileRouteTypes['to']>);
};
void (DEFAULT_ROUTES satisfies Routes);

const queryClient = new QueryClient();
const plugins = new PluginStore();
const workspaces = new WorkspaceStateStore(window.bridge?.workspaces);

// TODO: Disable the plugins and save the workspaces on reloads from the menu or DevTools
import.meta.hot?.on('vite:beforeFullReload', () => Promise.all([plugins.disableAll(), workspaces.flush()]));
window.bridge?.window?.onClose(async () => {
  await Promise.all([plugins.disableAll(), workspaces.flush()]);
});

window.bridge?.settings?.onChange((changed) => {
  if (changed === 'themes') {
    void queryClient.refetchQueries(userThemesQuery);
  } else {
    void queryClient.refetchQueries(userKeymapsQuery);
  }
});

// Plugins, settings, the user's themes and keymaps, and the project layout are awaited here so the first render has
// them and never shows a fallback.
await Promise.all([
  plugins.loadAll(),
  queryClient.query(settingsQuery),
  queryClient.query(userThemesQuery),
  queryClient.query(userKeymapsQuery),
  queryClient.query(projectLayoutQuery),
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('app');
if (root && !root.innerHTML) {
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <PluginStoreContext value={plugins}>
        <WorkspaceStateStoreContext value={workspaces}>
          <RouterProvider router={router} />
        </WorkspaceStateStoreContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
}
