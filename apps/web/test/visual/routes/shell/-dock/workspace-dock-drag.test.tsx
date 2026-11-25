import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { cancel, content, hold, mount, move, tab } from '../../../../dock-drag';
import { THEMES } from '../../../../sheet';

test.each(THEMES)('workspace dock dragged tab (%s)', async (theme) => {
  const dockview = await mount(theme);

  await hold('a', tab('c'));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-tab-dragged-${theme}`);
  await cancel(dockview);
});

test.each(THEMES)('workspace dock tab held over group content (%s)', async (theme) => {
  const dockview = await mount(theme);

  await hold('f', content('f'));
  await move(content('d'));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-drop-join-${theme}`);
  await cancel(dockview);
});

test.each(THEMES)('workspace dock tab held near edge of group content (%s)', async (theme) => {
  const dockview = await mount(theme);

  await hold('a', tab('b'));
  await move(content('d'), 0.9, 0.5);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-drop-split-${theme}`);
  await cancel(dockview);
});

test.each(THEMES)('workspace dock tab held on edge of dock (%s)', async (theme) => {
  const dockview = await mount(theme);

  await hold('a', tab('b'));
  await move(tab('a').closest('.dv-dockview') as Element, 0.25, 0.99);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-drop-edge-${theme}`);
  await cancel(dockview);
});

test.each(THEMES)('workspace dock dragged tabless panel (%s)', async (theme) => {
  const dockview = await mount(theme);

  await hold('fileTree', content('a'));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-tabless-dragged-${theme}`);
  await cancel(dockview);
});
