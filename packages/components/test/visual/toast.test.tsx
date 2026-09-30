import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastIcon,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from '../../src/components/toast';

import { Sheet, THEMES } from '../sheet.tsx';

const KINDS = [
  {
    type: 'success',
    title: 'Worktree created',
    description: 'reykjavik — from main',
  },
  {
    type: 'info',
    title: 'Daemon reconnected',
    description: 'Channel re-established',
  },
  {
    type: 'warning',
    title: 'Branch diverged',
    description: '3 behind origin/main',
  },
  {
    type: 'error',
    title: 'Commit failed',
    description: 'pre-commit hook exited 1',
  },
  { type: 'loading', title: 'Indexing…', description: '1,284 files scanned' },
] as const;

type Manager = ReturnType<typeof createToastManager>;

test.each(THEMES)('toast voices (%s)', async (theme) => {
  // One manager per kind. A single one would stack them, and a stack shows only
  // the frontmost toast — the other four peek as slivers.
  const managers = KINDS.map(() => createToastManager());

  await render(<ToastSheet managers={managers} theme={theme} />);

  // The provider subscribes in an effect, so a toast added before mount is
  // accepted by the manager and never reaches the viewport.
  KINDS.forEach((kind, index) => {
    managers[index].add({ ...kind, timeout: 0 });
  });

  await expect.poll(() => document.querySelectorAll('[data-slot="toast"]').length).toBe(KINDS.length);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`toast-${theme}`);
});

function ToastSheet({ managers, theme }: { managers: Manager[]; theme: 'light' | 'dark' }) {
  return (
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-8">
        {KINDS.map((kind, index) => (
          <Fragment key={kind.type}>
            <div className="text-muted-foreground text-xs">{kind.type}</div>
            <ToastProvider toastManager={managers[index]}>
              {/* The viewport is `fixed`, which would park it at the corner of
                  the page rather than inside the captured sheet. */}
              <ToastViewport className="relative inset-auto h-20 w-96">
                <List />
              </ToastViewport>
            </ToastProvider>
          </Fragment>
        ))}
      </div>
    </Sheet>
  );
}

function List() {
  const { toasts } = useToastManager();

  return toasts.map((item) => (
    <Toast key={item.id} toast={item}>
      <ToastContent>
        <ToastIcon type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}
