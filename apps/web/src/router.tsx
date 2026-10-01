import { createHashHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// Electron serves the built app over file://, where browser history cannot resolve a route on reload, so the `electron`
// build uses hash history. The browser keeps TanStack's default browser history.
export function getRouter(
  history: RouterHistory | undefined = import.meta.env.MODE === 'electron' ? createHashHistory() : undefined,
) {
  return createRouter({ routeTree, ...(history ? { history } : {}) });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
