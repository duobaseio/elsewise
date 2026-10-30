import { DEFAULT_ROUTES } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { userThemesQuery } from '@/appearance/themes';
import { userKeymapsQuery } from '@/command/keymap/keymap';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
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
// TODO: Disable the plugins on reloads from the menu or DevTools too, which close no window, once reloading goes
// through the main process.
window.bridge?.window?.onClose(() => plugins.disableAll());
// Vite waits for this before a full reload in development.
import.meta.hot?.on('vite:beforeFullReload', () => plugins.disableAll());

// Plugins, settings and the user's themes and keymaps are awaited here so the first render has them and never shows a
// fallback.
await Promise.all([
  plugins.loadAll(),
  queryClient.query(settingsQuery),
  queryClient.query(userThemesQuery),
  queryClient.query(userKeymapsQuery),
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
        <RouterProvider router={router} />
      </PluginStoreContext>
    </QueryClientProvider>,
  );
}
