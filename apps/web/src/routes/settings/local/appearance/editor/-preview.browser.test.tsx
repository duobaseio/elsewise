import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { pluginsQuery } from '@/plugins/loader';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

afterEach(() => {
  document.documentElement.style.removeProperty('--text-code');
});

// Opens Rust's page in a window `viewport` wide, and waits for the preview to fit its sample.
async function mount({ lineWrapping = false, guides = [] as number[], viewport = 1850 } = {}) {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      editor: { ...DEFAULT_SETTINGS.appearance.editor, lineWrapping, visualGuides: guides },
    },
  };
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  client.setQueryData(pluginsQuery.queryKey, []);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/local/appearance/editor/Rust'] }),
  });
  await render(
    <div className="h-dvh" style={{ width: viewport }}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </div>,
  );
  await expect.element(page.getByText('tracing::warn!', { exact: false })).toBeVisible();
  await expect.poll(() => width(), { interval: 50 }).toBeGreaterThan(384);
  await settle();
}

function width() {
  return document.querySelector('.cm-editor')?.closest<HTMLElement>('.dv-view')?.offsetWidth ?? 0;
}

// The fit lands on the first stable measurement, so wait until the width stops moving.
async function settle() {
  let last = width();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const next = width();
    if (next === last) {
      return next;
    }
    last = next;
  }
}

// A slow drag: one pointer move per frame, so every step gets its own layout. A fractional distance lands the panel
// edge between pixels, where the fit used to bounce.
async function drag(dx: number) {
  const sash = document.querySelector<HTMLElement>('.dv-sash');
  if (!sash) {
    throw new Error('no sash');
  }
  const rect = sash.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const at = (type: string, clientX: number) =>
    new PointerEvent(type, { bubbles: true, clientX, clientY: y, pointerId: 1, button: 0, buttons: 1 });
  sash.dispatchEvent(at('pointerdown', x));
  for (let step = 1; step <= 10; step++) {
    document.dispatchEvent(at('pointermove', x + (dx * step) / 10));
    await new Promise(requestAnimationFrame);
  }
  document.dispatchEvent(at('pointerup', x + dx));
}

function scroller() {
  return document.querySelector<HTMLElement>('.cm-scroller');
}

describe('Preview', () => {
  test('fits longest line on mount', async () => {
    await mount();
    expect(scroller()?.scrollWidth).toBe(scroller()?.clientWidth);
  });

  test('fits visual guide past longest line', async () => {
    await mount({ guides: [160], viewport: 2200 });
    expect(scroller()?.scrollWidth).toBe(scroller()?.clientWidth);
  });

  test('keeps width dragged to', async () => {
    await mount();
    const before = width();

    await drag(-53.3);

    expect(await settle()).toBe(before + 53);
  });

  test('keeps width dragged to while wrapping', async () => {
    await mount({ lineWrapping: true });
    const before = width();

    await drag(-53.3);

    expect(await settle()).toBe(before + 53);
  });

  test('refits when code font grows', async () => {
    await mount();
    const before = width();

    document.documentElement.style.setProperty('--text-code', '13px');

    await expect.poll(() => width(), { interval: 50 }).toBeGreaterThan(before);
    expect(scroller()?.scrollWidth).toBe(scroller()?.clientWidth);
  });
});
