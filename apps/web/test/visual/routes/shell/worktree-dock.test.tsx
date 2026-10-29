import type { DockviewApi } from 'dockview-react';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import 'dockview-react/dist/styles/dockview.css';
import '@/routes/_shell/dockview.css';

import { WorkTreeDock } from '@/routes/_shell/$project/$worktree';
import { STUB_PANELS } from '../../../dock-stubs';

import { forcePseudoStates, THEMES } from '../../../sheet';

async function mount(theme: 'light' | 'dark'): Promise<DockviewApi> {
  let api: DockviewApi | undefined;
  render(
    <div
      className="dockview-theme-elsewise bg-background font-sans text-foreground"
      data-brightness={theme}
      data-testid="sheet"
      style={{ width: 1100, height: 700 }}
    >
      <WorkTreeDock
        onDockviewReady={(readyApi) => {
          api = readyApi;
        }}
        panels={STUB_PANELS}
      />
    </div>,
  );
  await vi.waitFor(() => {
    if (document.querySelectorAll('.dv-groupview').length !== 3) {
      throw new Error('dock not built');
    }
  });
  if (!api) {
    throw new Error('dock not ready');
  }
  return api;
}

test.each(THEMES)('worktree dock default layout (%s)', async (theme) => {
  await mount(theme);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`worktree-dock-default-${theme}`);
});

async function addEditorGroupTerminals(api: DockviewApi) {
  const editorGroup = api.getPanel('editor:$worktree.tsx')?.group;
  if (!editorGroup) {
    throw new Error('no editor group');
  }
  for (const index of [2, 3]) {
    api.addPanel({
      id: `term-${index}`,
      component: 'terminal',
      title: `zsh ${index}`,
      params: { index },
      position: { referenceGroup: editorGroup },
    });
  }
  api.getPanel('editor:$worktree.tsx')?.api.setActive();
  await vi.waitFor(() => {
    if (editorGroup.element.querySelectorAll('.dv-tab').length !== 3) {
      throw new Error('terminal tabs not added');
    }
  });
}

const EDITOR_TAB = '.dv-active-group .dv-tabs-container > .dv-tab:nth-child(1)';
const HIDDEN_TAB = '.dv-active-group .dv-tabs-container > .dv-tab:nth-child(2)';

test.each(THEMES)('worktree dock tab hover states (%s)', async (theme) => {
  await addEditorGroupTerminals(await mount(theme));

  await forcePseudoStates([
    { selector: EDITOR_TAB, pseudoClasses: ['hover'] },
    {
      selector: `${EDITOR_TAB} button[aria-label^="Close"]`,
      pseudoClasses: ['hover'],
    },
    { selector: HIDDEN_TAB, pseudoClasses: ['hover'] },
    {
      selector: `${HIDDEN_TAB} [class*="group/tab"]`,
      pseudoClasses: ['hover'],
    },
    {
      selector: '.dv-inactive-group .dv-tab.dv-active-tab',
      pseudoClasses: ['hover'],
    },
    { selector: '.dv-tab:has([data-tool])', pseudoClasses: ['hover'] },
  ]);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`worktree-dock-tab-hover-${theme}`);
});

test.each(THEMES)('worktree dock tab focus states (%s)', async (theme) => {
  await addEditorGroupTerminals(await mount(theme));

  await forcePseudoStates([
    { selector: EDITOR_TAB, pseudoClasses: ['focus-visible'] },
    {
      selector: `${HIDDEN_TAB} button[aria-label^="Close"]`,
      pseudoClasses: ['focus-visible'],
    },
  ]);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`worktree-dock-tab-focus-${theme}`);
});

test.each(THEMES)('worktree dock tree collapsed (%s)', async (theme) => {
  const api = await mount(theme);

  api.getPanel('fileTree')?.group.api.setVisible(false);
  await vi.waitFor(() => {
    const toggle = document.querySelector('button[aria-label="Toggle file tree"]');
    if (toggle?.getAttribute('aria-pressed') !== 'false') {
      throw new Error('tree not collapsed');
    }
  });

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`worktree-dock-collapsed-${theme}`);
});
