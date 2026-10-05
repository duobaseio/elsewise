import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    // TODO: Default to the last-visited worktree once that state exists.
    throw redirect({
      to: '/$project/$worktree',
      params: { project: 'Elsewise', worktree: 'Singapore' },
    });
  },
});
