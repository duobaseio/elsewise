import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { getRouter } from './router';

const root = document.getElementById('app');
if (root && !root.innerHTML) {
  createRoot(root).render(<RouterProvider router={getRouter()} />);
}
