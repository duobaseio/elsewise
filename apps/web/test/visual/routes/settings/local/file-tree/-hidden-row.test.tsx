import { DEFAULT_FRONTEND_SETTINGS } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { FILE_TREE_TERMS } from '@/routes/settings/local/file-tree';
import { HiddenRow } from '@/routes/settings/local/file-tree/-hidden-row';
import { settingsQuery } from '@/settings/settings';

import { forcePseudoStates, THEMES } from '../../../../../sheet';

async function mount(theme: (typeof THEMES)[number], hidden: readonly string[]) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    ...DEFAULT_FRONTEND_SETTINGS,
    fileTree: { ...DEFAULT_FRONTEND_SETTINGS.fileTree, hidden: [...hidden] },
  });
  await render(
    <QueryClientProvider client={client}>
      <div
        className="bg-background p-8 font-sans text-foreground"
        data-brightness={theme}
        data-testid="sheet"
        style={{ width: 800 }}
      >
        <HiddenRow term={FILE_TREE_TERMS.hidden} />
      </div>
    </QueryClientProvider>,
  );
}

test.each(THEMES)('hidden row selected (%s)', async (theme) => {
  await mount(theme, DEFAULT_FRONTEND_SETTINGS.fileTree.hidden);

  await userEvent.click(page.getByRole('option', { name: '.hg' }));
  await userEvent.keyboard('{Escape}');
  await forcePseudoStates([{ selector: '[role="option"][aria-label=".svn"]', pseudoClasses: ['hover'] }]);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`hidden-row-selected-${theme}`);
});

test.each(THEMES)('hidden row duplicate (%s)', async (theme) => {
  await mount(theme, ['.git', 'node_modules/', 'src/gen']);

  await userEvent.click(page.getByRole('textbox', { name: 'Add pattern' }));
  await userEvent.keyboard('src/gen{Enter}');
  await expect.element(page.getByRole('textbox', { name: 'Add pattern' })).toHaveAttribute('aria-invalid', 'true');

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`hidden-row-duplicate-${theme}`);
});

test.each(THEMES)('hidden row empty (%s)', async (theme) => {
  await mount(theme, []);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`hidden-row-empty-${theme}`);
});

test.each(THEMES)('hidden row adding (%s)', async (theme) => {
  await mount(theme, ['.git', 'node_modules/']);

  await userEvent.click(page.getByRole('textbox', { name: 'Add pattern' }));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`hidden-row-adding-${theme}`);
});
