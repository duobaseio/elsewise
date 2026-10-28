import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The storage key of the settings page last open.
 */
export const PAGE = 'elsewise.settings.page';

export const Route = createFileRoute('/settings/')({
  loader: () => {
    let page: string | null = null;
    try {
      page = localStorage.getItem(PAGE);
    } catch {
      // Unable to retrieve stored page, that's fine.
    }

    throw page?.startsWith('/settings/')
      ? redirect({ href: page, replace: true })
      : redirect({ to: '/settings/appearance/general', replace: true });
  },
});
