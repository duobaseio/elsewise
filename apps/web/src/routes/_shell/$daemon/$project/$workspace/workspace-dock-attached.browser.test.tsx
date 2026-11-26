import { PLATFORM } from '@elsewise/components/lib/platform';
import { DEFAULT_FRONTEND_SETTINGS } from '@elsewise/frontend-plugin';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { builtInApplication } from '../../../../../../test/commands';
import { addFile, FILE, FILE_TREE, showWorkspace, WORKSPACE, workspaceRouter } from '../../../../../../test/dock';
import { WorkspaceDock } from './route';

import 'dockview-react/dist/styles/dockview.css';

// A dock attached to an application that shows its workspace, with `settings` if given.
async function mount(settings?: SettingsPanelManager) {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({
    router,
    settings,
    projects: new ProjectManager(client, router),
  });
  await showWorkspace(router);
  await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());

  await render(
    <ApplicationManagerContext value={application}>
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          onDockviewReady={(ready) => {
            addFile(ready);
            application.docks.attach(WORKSPACE, ready);
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => expect(application.docks.active).not.toBeNull());
  return application.docks.active as NonNullable<typeof application.docks.active>;
}

test('hides and shows file tree from tool stripe', async () => {
  const dock = await mount();
  const toggle = page.getByRole('button', { name: 'Toggle file tree' });
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();

  expect(dock.groups[1]).toEqual({ panels: [FILE_TREE], shown: null });
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();

  expect(dock.groups[1]).toEqual({ panels: [FILE_TREE], shown: FILE_TREE });
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('shows file tree hidden through dock in tool stripe', async () => {
  const dock = await mount();

  dock.hide(FILE_TREE);

  await expect.element(page.getByRole('button', { name: 'Toggle file tree' })).toHaveAttribute('aria-pressed', 'false');
});

test('adds terminal with close confirmation as set', async () => {
  const dock = await mount(
    new SettingsPanelManager([], {
      ...DEFAULT_FRONTEND_SETTINGS,
      terminal: { ...DEFAULT_FRONTEND_SETTINGS.terminal, closeConfirmation: true },
    }),
  );
  const added = vi.spyOn(dock, 'addTerminal').mockResolvedValue(null);

  await page.getByRole('button', { name: 'New tab' }).click();

  expect(added).toHaveBeenCalledExactlyOnceWith({ closeConfirmation: true }, { tab: 'last', with: FILE });
});

const hiddenTabs = () => document.querySelector('button[aria-label="Show hidden tabs"]') as HTMLElement;

test('shows tab actions after tabs only', async () => {
  await mount();

  await expect.element(page.getByRole('button', { name: 'New tab' })).toBeVisible();
  expect(document.querySelectorAll('button[aria-label="New tab"]')).toHaveLength(1);
  expect(document.querySelectorAll('button[aria-label="Show hidden tabs"]')).toHaveLength(1);
});

test('shows overflowing tabs button while tabs overflow', async () => {
  const dock = await mount();
  await expect.element(page.getByRole('button', { name: 'New tab' })).toBeVisible();
  expect(getComputedStyle(hiddenTabs()).visibility).toBe('hidden');

  const added = Array.from({ length: 12 }, (_, index) =>
    dock.addFile(`src/overflowing-tab-${index}.ts`, { tab: 'last', with: FILE }),
  );
  await vi.waitFor(() => expect(getComputedStyle(hiddenTabs()).visibility).toBe('visible'));

  for (const panel of added) {
    if (panel !== null) {
      await dock.close(panel);
    }
  }
  await vi.waitFor(() => expect(getComputedStyle(hiddenTabs()).visibility).toBe('hidden'));
});

test('keeps space of overflowing tabs button while tabs fit', async () => {
  await mount();
  await expect.element(page.getByRole('button', { name: 'New tab' })).toBeVisible();

  const add = document.querySelector('button[aria-label="New tab"]') as HTMLElement;
  expect(hiddenTabs().getBoundingClientRect().width).toBe(add.getBoundingClientRect().width);
});

test('names tab actions in tooltips', async () => {
  const dock = await mount();
  for (let index = 0; index < 12; index++) {
    dock.addFile(`src/overflowing-tab-${index}.ts`, { tab: 'last', with: FILE });
  }
  await vi.waitFor(() => expect(getComputedStyle(hiddenTabs()).visibility).toBe('visible'));

  await userEvent.hover(page.getByRole('button', { name: 'New tab' }));
  await expect.element(page.getByText('New tab')).toBeVisible();

  await userEvent.hover(hiddenTabs());
  await expect.element(page.getByText('Show hidden tabs')).toBeVisible();
});

// Adds files until tabs overflow, shows the first tab again, and opens the menu of the overflowing ones.
async function openOverflowing(dock: Awaited<ReturnType<typeof mount>>) {
  for (let index = 0; index < 12; index++) {
    dock.addFile(`src/overflowing-tab-${index}.ts`, { tab: 'last', with: FILE });
  }
  dock.activate(FILE);
  await vi.waitFor(() => expect(getComputedStyle(hiddenTabs()).visibility).toBe('visible'));
  await userEvent.click(hiddenTabs());
  await expect.element(page.getByRole('menuitem').first()).toBeVisible();
  return () => [...document.querySelectorAll('[role="menuitem"]')].map((row) => row.textContent);
}

const tabTitles = () =>
  [...(hiddenTabs().closest('.dv-tabs-and-actions-container')?.querySelectorAll('.dv-tab') ?? [])].map(
    (tab) => tab.textContent,
  );

test('lists overflowing tabs in order', async () => {
  const rows = await openOverflowing(await mount());

  expect(rows().length).toBeGreaterThan(0);
  expect(rows().length).toBeLessThan(12);
  expect(rows()).toEqual(tabTitles().slice(-rows().length));
});

test('activates and shows tab chosen from overflowing tabs', async () => {
  const dock = await mount();
  const rows = await openOverflowing(dock);
  const title = rows().at(-1) ?? '';

  await userEvent.click(document.querySelector('[role="menuitem"]:last-child') as HTMLElement);

  await vi.waitFor(() => expect(document.querySelector('[role="menuitem"]')).toBeNull());
  const tab = document.querySelector('.dv-active-tab') as HTMLElement;
  const strip = tab.closest('.dv-tabs-container') as HTMLElement;
  expect(tab.textContent).toBe(title);
  expect(dock.activePanel).toMatchObject({ relativePath: `src/${title}` });
  await vi.waitFor(() =>
    expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(strip.getBoundingClientRect().right + 0.5),
  );
});

test('shows shown tab chosen from overflowing tabs', async () => {
  const dock = await mount();
  for (let index = 0; index < 12; index++) {
    dock.addFile(`src/overflowing-tab-${index}.ts`, { tab: 'last', with: FILE });
  }
  const tab = await vi.waitFor(() => {
    const active = document.querySelector('.dv-active-tab') as HTMLElement;
    expect(active.textContent).toBe('overflowing-tab-11.ts');
    return active;
  });
  const strip = tab.closest('.dv-tabs-container') as HTMLElement;
  strip.scrollLeft = 0;
  await vi.waitFor(() => expect(getComputedStyle(hiddenTabs()).visibility).toBe('visible'));

  await userEvent.click(hiddenTabs());
  await expect.element(page.getByRole('menuitem').first()).toBeVisible();
  await userEvent.click(document.querySelector('[role="menuitem"]:last-child') as HTMLElement);

  await vi.waitFor(() =>
    expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(strip.getBoundingClientRect().right + 0.5),
  );
});

test('keeps overflowing tabs open when one closes', async () => {
  const dock = await mount();
  const rows = await openOverflowing(dock);
  const [title, ...others] = rows();

  await page
    .getByRole('menu')
    .getByRole('button', { name: `Close ${title}` })
    .click();

  await vi.waitFor(() => expect(rows()).toEqual(others));
  expect(dock.panels.some((panel) => panel.type === 'file' && panel.relativePath === `src/${title}`)).toBe(false);
});

test('closes overflowing tabs once every tab fits', async () => {
  const rows = await openOverflowing(await mount());

  for (const title of rows()) {
    await page
      .getByRole('menu')
      .getByRole('button', { name: `Close ${title}` })
      .click();
  }

  await vi.waitFor(() => expect(document.querySelector('[role="menuitem"]')).toBeNull());
  expect(getComputedStyle(hiddenTabs()).visibility).toBe('hidden');
});

const CLOSE = PLATFORM === 'mac' ? '{Meta>}{Backspace}{/Meta}' : '{Delete}';
const highlighted = () => document.querySelector('[role="menuitem"][data-highlighted]')?.textContent;

test('closes highlighted overflowing tab by key', async () => {
  const dock = await mount();
  const rows = await openOverflowing(dock);
  const [first, second, third, ...others] = rows();
  await userEvent.hover(document.querySelectorAll('[role="menuitem"]')[1] as HTMLElement);

  await userEvent.keyboard(CLOSE);

  await vi.waitFor(() => expect(rows()).toEqual([first, third, ...others]));
  expect(dock.panels.some((panel) => panel.type === 'file' && panel.relativePath === `src/${second}`)).toBe(false);
  await vi.waitFor(() => expect(highlighted()).toBe(third));
});

test('highlights previous overflowing tab when last one closes by key', async () => {
  const rows = await openOverflowing(await mount());
  const before = rows().at(-2);
  await userEvent.hover(document.querySelector('[role="menuitem"]:last-child') as HTMLElement);

  await userEvent.keyboard(CLOSE);

  await vi.waitFor(() => expect(rows().at(-1)).toBe(before));
  await vi.waitFor(() => expect(highlighted()).toBe(before));
});

test('keeps highlight when tab that refused to close by key closes later', async () => {
  const dock = await mount();
  const rows = await openOverflowing(dock);
  const [first, second, third, ...others] = rows();
  const panel = dock.panels.find((open) => open.type === 'file' && open.relativePath === `src/${second}`);
  const closed = vi.spyOn(dock, 'close').mockResolvedValueOnce(false);
  await userEvent.hover(document.querySelectorAll('[role="menuitem"]')[1] as HTMLElement);
  await userEvent.keyboard(CLOSE);
  await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
  await userEvent.hover(document.querySelector('[role="menuitem"]') as HTMLElement);

  if (panel?.closable) {
    await dock.close(panel);
  }

  await vi.waitFor(() => expect(rows()).toEqual([first, third, ...others]));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(highlighted()).toBe(first);
});

test('keeps overflowing tabs closed when tabs overflow again', async () => {
  const dock = await mount();
  const rows = await openOverflowing(dock);
  for (const title of rows()) {
    await page
      .getByRole('menu')
      .getByRole('button', { name: `Close ${title}` })
      .click();
  }
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());

  for (let index = 0; index < 12; index++) {
    dock.addFile(`src/again-${index}.ts`, { tab: 'last', with: FILE });
  }
  dock.activate(FILE);

  await vi.waitFor(() => expect(getComputedStyle(hiddenTabs()).visibility).toBe('visible'));
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(document.querySelector('[role="menuitem"]')).toBeNull();
});

test('keeps shown tab in view when actions after strip widen', async () => {
  const dock = await mount();
  for (let index = 0; index < 12; index++) {
    dock.addFile(`src/overflowing-tab-${index}.ts`, { tab: 'last', with: FILE });
  }
  const tab = await vi.waitFor(() => {
    const active = document.querySelector('.dv-active-tab') as HTMLElement;
    expect(active.textContent).toBe('overflowing-tab-11.ts');
    return active;
  });
  const strip = tab.closest('.dv-tabs-container') as HTMLElement;
  const { width } = strip.getBoundingClientRect();

  (hiddenTabs().closest('.dv-left-actions-container') as HTMLElement).style.minWidth = '300px';

  await vi.waitFor(() => {
    expect(strip.getBoundingClientRect().width).toBeLessThan(width);
    expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(strip.getBoundingClientRect().right + 0.5);
  });
});

test('scrolls tab into view once shown', async () => {
  const dock = await mount();
  for (let index = 0; index < 12; index++) {
    dock.addFile(`src/overflowing-tab-${index}.ts`, { tab: 'last', with: FILE });
  }

  await vi.waitFor(() => {
    const tab = document.querySelector('.dv-active-tab') as HTMLElement;
    const strip = tab.closest('.dv-tabs-container') as HTMLElement;
    expect(tab.textContent).toBe('overflowing-tab-11.ts');
    expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(strip.getBoundingClientRect().right + 0.5);
  });
});
