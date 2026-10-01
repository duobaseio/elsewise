import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { getRouter } from './router';

const queryClient = new QueryClient();

const root = document.getElementById('app');
if (root && !root.innerHTML) {
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={getRouter()} />
    </QueryClientProvider>,
  );
}
