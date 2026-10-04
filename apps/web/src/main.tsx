import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { PluginLoader, pluginsQuery } from './plugins/loader';
import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient();

// TODO: Replace with lazy loading.
const plugins = new PluginLoader();
for (const plugin of await queryClient.query(pluginsQuery)) {
  if (plugin.enabled) {
    void plugins.load(plugin.id, plugin.url);
  }
}

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
