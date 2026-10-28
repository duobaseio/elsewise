import { SearchAddon } from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';
import { createRef } from 'react';
import { expect, onTestFinished, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { THEMES as LOADED, resolveActiveTheme } from '@/appearance/themes';
import { CommandManagerContext } from '@/command/command-manager';
import { SearchBar } from '@/terminal/search/search-bar';
import { builtInCommands } from '../../../commands';

import { THEMES } from '../../../sheet';

test.each(THEMES)('terminal search bar (%s)', async (theme) => {
  // A terminal outside the sheet, whose buffer the bar searches.
  const host = document.createElement('div');
  document.body.append(host);
  const terminal = new Terminal({ allowProposedApi: true });
  const search = new SearchAddon();
  terminal.loadAddon(search);
  terminal.open(host);
  onTestFinished(() => {
    terminal.dispose();
    host.remove();
  });
  await new Promise<void>((resolve) => terminal.write('session one\r\nsession two\r\nsession three', resolve));
  const { background, foreground } = resolveActiveTheme(
    LOADED,
    { source: 'elsewise', name: 'elsewise' },
    theme,
  ).terminal;

  render(
    <div
      className="relative font-sans"
      data-brightness={theme}
      data-testid="sheet"
      style={{ width: 560, height: 96, background, color: foreground }}
    >
      <CommandManagerContext value={builtInCommands()}>
        <SearchBar
          decorations={{ matchOverviewRuler: '#000000', activeMatchColorOverviewRuler: '#000000' }}
          field={createRef()}
          initial={{ query: 'session', caseSensitive: false, wholeWord: false, regex: false }}
          onClose={() => {}}
          search={search}
        />
      </CommandManagerContext>
    </div>,
  );
  await expect.element(page.getByRole('status')).toHaveTextContent('1/3');

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`terminal-search-bar-${theme}`);
});
