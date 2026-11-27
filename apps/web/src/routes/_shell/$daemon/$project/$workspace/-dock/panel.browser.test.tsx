import type { IDockviewPanelProps } from 'dockview-react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { builtInApplication } from '../../../../../../../test/commands';
import { Panel, usePanelFocus } from './panel';

// Content with two buttons, which picks the second with the focus `picked` gives it, once Ready is pressed if `late`.
function Content({ picked, late }: { picked?: (second: HTMLElement) => void; late?: boolean }) {
  const [ready, setReady] = useState(late !== true);
  usePanelFocus(
    ready && picked !== undefined ? (content) => picked(content.querySelector('[data-second]') as HTMLElement) : null,
  );
  return (
    <>
      <button type="button">First</button>
      <button data-second type="button">
        Second
      </button>
      <button onClick={() => setReady(true)} type="button">
        Ready
      </button>
    </>
  );
}

// Renders the content of the panel p in a dock, beside a field outside the dock, and returns the application's docks.
async function mount(content: Parameters<typeof Content>[0] = {}) {
  const application = builtInApplication();
  await render(
    <ApplicationManagerContext value={application}>
      <input aria-label="Outside" />
      <div className="dv-dockview">
        <Panel
          {...({ api: { id: 'p' } } as IDockviewPanelProps)}
          component={{ type: 'file', header: () => null, panel: () => <Content {...content} /> }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await expect.element(page.getByRole('button', { name: 'First' })).toBeVisible();
  return application.docks;
}

describe('Panel', () => {
  test('focuses first focusable element when its panel is asked', async () => {
    const docks = await mount();

    docks.requestPanelFocus('p');

    await expect.element(page.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  test('focuses what content picks', async () => {
    const docks = await mount({ picked: (second) => second.focus() });

    docks.requestPanelFocus('p');

    await expect.element(page.getByRole('button', { name: 'Second' })).toHaveFocus();
  });

  test('ignores request of other panel', async () => {
    const docks = await mount();

    docks.requestPanelFocus('other');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.activeElement).toBe(document.body);
  });

  test('leaves focus that is in its panel', async () => {
    const docks = await mount();
    page.getByRole('button', { name: 'Second' }).element().focus();

    docks.requestPanelFocus('p');
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect.element(page.getByRole('button', { name: 'Second' })).toHaveFocus();
  });

  test('focuses first focusable element when what content picks throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const docks = await mount({
      picked: () => {
        throw new Error('broken');
      },
    });

    docks.requestPanelFocus('p');

    await expect.element(page.getByRole('button', { name: 'First' })).toHaveFocus();
    expect(logged).toHaveBeenCalledWith('Focusing panel p failed', expect.any(Error));
  });

  test('takes focus once per request', async () => {
    const docks = await mount({ picked: (second) => second.focus(), late: true });
    docks.requestPanelFocus('p');
    await expect.element(page.getByRole('button', { name: 'First' })).toHaveFocus();
    page.getByRole('textbox', { name: 'Outside' }).element().focus();

    await userEvent.click(page.getByRole('button', { name: 'Ready' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect.element(page.getByRole('button', { name: 'Ready' })).toHaveFocus();
  });
});

// Content that has nothing to focus until it is ready, then a field that it picks.
function Loading({ params }: IDockviewPanelProps<{ ready: boolean }>) {
  usePanelFocus(params.ready ? (content) => content.querySelector('input')?.focus() : null);
  return params.ready ? <input aria-label="Loaded" /> : <p>Loading</p>;
}

describe('usePanelFocus', () => {
  // Renders the content of the panel p, which loads until the returned function is called.
  async function mountLoading() {
    const application = builtInApplication();
    const tree = (ready: boolean) => (
      <ApplicationManagerContext value={application}>
        <input aria-label="Outside" />
        <div className="dv-dockview">
          <Panel
            {...({ api: { id: 'p' } } as IDockviewPanelProps)}
            component={{ type: 'file', header: () => null, panel: Loading }}
            params={{ ready }}
          />
        </div>
      </ApplicationManagerContext>
    );
    const screen = await render(tree(false));
    return { docks: application.docks, load: () => screen.rerender(tree(true)) };
  }

  test('gives focus to content that picks it after its panel was asked', async () => {
    const { docks, load } = await mountLoading();
    docks.requestPanelFocus('p');

    await load();

    await expect.element(page.getByRole('textbox', { name: 'Loaded' })).toHaveFocus();
  });

  test('leaves focus that went outside dock meanwhile', async () => {
    const { docks, load } = await mountLoading();
    docks.requestPanelFocus('p');
    await new Promise((resolve) => setTimeout(resolve, 50));
    page.getByRole('textbox', { name: 'Outside' }).element().focus();

    await load();
    await expect.element(page.getByRole('textbox', { name: 'Loaded' })).toBeVisible();

    await expect.element(page.getByRole('textbox', { name: 'Outside' })).toHaveFocus();
  });
});
