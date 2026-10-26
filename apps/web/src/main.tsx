import { DEFAULT_ROUTES } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { pluginsQuery } from '@/plugins/loader';
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

// Plugins and settings are awaited here so the first render has them and never shows a fallback.
await Promise.all([queryClient.query(pluginsQuery), queryClient.query(settingsQuery)]);

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
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
