import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { CodeEditor } from '@/components/code-editor/code-editor';
import { toggleReplaceRow } from '@/components/code-editor/search-bar-query';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../sheet';

const CODE = `/// Attaches to the session with \`id\`.
pub async fn attach(&self, id: SessionId) -> Result<Channel> {
    let session = self.sessions.get(&id).ok_or(Error::NotFound)?;
    let (tx, rx) = channel::bounded(64);
    session.subscribe(tx).await?;
    Ok(Channel::new(rx))
}
`;

async function mount(theme: 'light' | 'dark'): Promise<EditorView> {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, brightness: theme },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <div
        className="bg-background font-sans text-foreground"
        data-brightness={theme}
        data-testid="editor"
        style={{ width: 1040, height: 300 }}
      >
        <CodeEditor code={CODE} path="transport.rs" />
      </div>
    </QueryClientProvider>,
  );

  // The language loads after the first paint.
  await vi.waitFor(() => {
    if (document.querySelector('.cm-line span') === null) {
      throw new Error('not highlighted');
    }
  });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement);
  if (view === null) {
    throw new Error('no editor');
  }
  return view;
}

test.each(THEMES)('code editor (%s)', async (theme) => {
  await mount(theme);

  await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-${theme}`);
});

test.each(THEMES)('code editor, search and replace (%s)', async (theme) => {
  const view = await mount(theme);
  openSearchPanel(view);
  view.dispatch({
    effects: [setSearchQuery.of(new SearchQuery({ search: 'session', replace: 'channel' })), toggleReplaceRow.of(true)],
  });
  findNext(view);
  await expect.element(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();

  await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-search-${theme}`);
});
