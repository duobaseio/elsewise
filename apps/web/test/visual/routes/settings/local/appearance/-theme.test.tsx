import type { InstalledPlugin } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { userThemesQuery } from '@/appearance/themes';
import { pluginsQuery } from '@/plugins/loader';
import { ThemeSelect } from '@/routes/settings/local/appearance/-theme';

import { THEMES } from '../../../../../sheet';

const NIGHT = { name: 'Night', dark: { interface: { background: '#000000' }, editor: {}, terminal: {} } };

const PLUGIN: InstalledPlugin = {
  manifest: { id: 'io.example', name: 'Example', version: '1.0.0', main: 'main.js' },
  enabled: true,
  themes: [{ id: 'night', theme: NIGHT }],
  keymaps: [],
  url: '',
};

const ELSEWISE = { source: 'elsewise', id: 'elsewise' } as const;

// Opens `select` on a sheet in `theme`, with `PLUGIN` installed and a user theme.
async function open(theme: (typeof THEMES)[number], select: ReactNode) {
  // The popup is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  const client = new QueryClient();
  client.setQueryData(pluginsQuery.queryKey, [PLUGIN]);
  client.setQueryData(userThemesQuery.queryKey, [{ id: 'midnight', theme: { ...NIGHT, name: 'Midnight' } }]);
  await render(
    <QueryClientProvider client={client}>
      <div
        className="bg-background p-2 font-sans text-foreground"
        data-brightness={theme}
        data-testid="sheet"
        style={{ width: 320, height: 560 }}
      >
        {select}
      </div>
    </QueryClientProvider>,
  );

  await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
  await expect.element(page.getByRole('option', { name: 'Elsewise' })).toBeVisible();
}

test.each(THEMES)('theme select (%s)', async (theme) => {
  await open(theme, <ThemeSelect label="Theme" theme={ELSEWISE} onChange={() => {}} />);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`theme-select-${theme}`);
});

test.each(THEMES)('theme select inheritable (%s)', async (theme) => {
  await open(theme, <ThemeSelect inheritable label="Theme" theme={null} onChange={() => {}} />);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`theme-select-inheritable-${theme}`);
});

test.each(THEMES)('theme select search (%s)', async (theme) => {
  await open(theme, <ThemeSelect label="Theme" theme={ELSEWISE} onChange={() => {}} />);
  // Matches a theme in every group, including those below the popup's scroll height.
  await userEvent.fill(page.getByPlaceholder('Search themes'), 'night');
  await expect.element(page.getByRole('option', { name: 'Midnight' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`theme-select-search-${theme}`);
});
