import type {} from '@elsewise/bridge';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useLayoutEffect } from 'react';

import '../styles.css';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  // The desktop keeps its window hidden until the page reports its background, so the window never flashes a color
  // the page does not paint.
  useLayoutEffect(() => {
    window.bridge?.window?.setBackground(getComputedStyle(document.body).backgroundColor);
  }, []);

  return <Outlet />;
}
