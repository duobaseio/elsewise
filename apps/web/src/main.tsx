import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { pluginsQuery } from '@/plugins/loader';
import { Plugins } from '@/plugins/plugins';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

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
      <Plugins />
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
