import type { InstalledFrontendPlugin } from '@elsewise/bridge';
import { formatKey } from '@elsewise/components/lib/platform';
import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStoreContext } from '@/plugins/plugin-store';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';
import { pluginStore } from '../../../../../../test/plugins';

const FIND = 'elsewise.editor.search.find';

const SETTINGS = 'elsewise.application.settings.open';

const DUPLICATE = 'elsewise.editor.edit.duplicateLine';

const COPY = 'elsewise.terminal.clipboard.copy';

// A plugin with a keymap that adds groups at the top level and in Editor, one of them without commands.
const PLUGIN: InstalledFrontendPlugin = {
  manifest: { id: 'io.example', name: 'Example', version: '1.0.0', elsewise: '^1.0.0', frontend: { main: 'main.js' } },
  enabled: true,
  themes: [],
  keymaps: [{ id: 'vim', keymap: { name: 'Vim', keys: { [FIND]: ['F9'] } } }],
  url: `data:text/javascript,${encodeURIComponent(`
    export default function () {
      return {
        onEnable(app) {
          return [
            app.commands.addGroups([
              { id: 'io.example', label: 'Example' },
              { id: 'io.example.empty', in: 'io.example', label: 'Empty' },
              { id: 'io.example.tone', in: 'io.example', label: 'Tone' },
              { id: 'io.example.editor', in: 'elsewise.editor', label: 'Extras' },
            ]),
            app.commands.add([
              { id: 'io.example.shrug', group: 'io.example', scope: 'application', label: 'Shrug', run: () => true },
              { id: 'io.example.uwu', group: 'io.example.tone', scope: 'editor', label: 'uwu', run: () => true },
              { id: 'io.example.extra', group: 'io.example.editor', scope: 'editor', label: 'Extra', run: () => true },
            ]),
          ];
        },
      };
    }
  `)}`,
};

const MINE = { name: 'Mine', keys: { [FIND]: ['Mod-Shift-x', 'F9'] } };

// Binds F9 to two editor commands and a terminal one.
const SHARING = { name: 'Mine', keys: { [FIND]: ['Mod-Shift-x', 'F9'], [DUPLICATE]: ['F9'], [COPY]: ['F9'] } };

const SELECT_MINE: FrontendSettings = { ...DEFAULT_FRONTEND_SETTINGS, keymap: { source: 'user', id: 'mine' } };

const SELECT_VIM: FrontendSettings = {
  ...DEFAULT_FRONTEND_SETTINGS,
  keymap: { source: 'plugin', plugin: 'io.example', id: 'vim' },
};

afterEach(() => {
  window.bridge = undefined;
});

// Opens the Keymap page with `settings`, `plugins` installed and `keymap` as the user keymap `mine`. Returns the
// bridge's saves and deletes.
async function mount(
  settings: FrontendSettings = DEFAULT_FRONTEND_SETTINGS,
  plugins: InstalledFrontendPlugin[] = [],
  keymap = MINE,
) {
  const save = vi.fn(async () => {});
  const saveUserKeymap = vi.fn(async () => {});
  const deleteUserKeymap = vi.fn(async () => {});
  window.bridge = {
    settings: {
      load: async () => settings,
      save,
      loadPlugin: async () => ({}),
      savePlugin: async () => {},
      loadUserThemes: async () => [],
      saveUserTheme: async () => {},
      deleteUserTheme: async () => {},
      loadUserKeymaps: async () => [{ id: 'mine', keymap }],
      saveUserKeymap,
      deleteUserKeymap,
      onChange: () => {},
    },
  };
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/local/appearance/keymap'] }),
  });
  const store = await pluginStore(plugins);
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={store}>
        <WorkspaceStateStoreContext value={new WorkspaceStateStore(undefined)}>
          <RouterProvider router={router} />
        </WorkspaceStateStoreContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'Keymap' })).toBeVisible();
  return { save, saveUserKeymap, deleteUserKeymap };
}

function headings() {
  return page
    .getByRole('heading', { level: 2 })
    .elements()
    .map((heading) => [...heading.querySelectorAll('span')].map((label) => label.textContent));
}

function shown() {
  return document.querySelector('[aria-label="Keymap"] [data-slot="combobox-value"]')?.textContent;
}

function row(id: string) {
  return page.elementLocator(document.getElementById(id) as HTMLElement);
}

// Returns the ids of the rows in the section labelled `section`.
function rows(section: string) {
  return [...document.querySelectorAll(`[role="listbox"][aria-label="${section}"] [role="option"]`)].map(
    (option) => option.id,
  );
}

function field() {
  return page.getByRole('textbox', { name: 'Key' });
}

function search() {
  return page.getByRole('textbox', { name: 'Search commands' });
}

// Returns the ids of the rows shown.
function options() {
  return page
    .getByRole('option')
    .elements()
    .map((option) => option.id);
}

function keys(id: string) {
  return [...(document.getElementById(id)?.querySelectorAll('[data-slot="kbd"]') ?? [])].map((key) => key.textContent);
}

describe('Keymap', () => {
  test('lists sections by group path in addition order, skipping groups without commands', async () => {
    await mount(DEFAULT_FRONTEND_SETTINGS, [PLUGIN]);

    await expect.element(page.getByRole('heading', { name: 'Example Tone' })).toBeVisible();
    expect(headings()).toEqual([
      ['Application'],
      ['Editor', 'Code'],
      ['Editor', 'Compare'],
      ['Editor', 'Edit'],
      ['Editor', 'Navigate'],
      ['Editor', 'Extras'],
      ['Terminal'],
      ['File tree'],
      ['Project'],
      ['Workspace'],
      ['Example'],
      ['Example', 'Tone'],
    ]);
  });

  test('shows keys as written in selected keymap', async () => {
    await mount({ ...DEFAULT_FRONTEND_SETTINGS, keymap: { source: 'user', id: 'mine' } });

    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x'), formatKey('F9')]);
  });

  test('selects row on click and clears on Escape', async () => {
    await mount();

    await userEvent.click(row(FIND));

    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'true');
    await expect.element(row(FIND)).toHaveFocus();
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'false');
  });

  test('clears selection on outside press', async () => {
    await mount();
    await userEvent.click(row(FIND));
    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(page.getByRole('heading', { name: 'Keymap', exact: true }));

    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'false');
  });

  test('moves selection with arrow keys across open sections', async () => {
    await mount();
    await userEvent.click(page.getByRole('button', { name: 'Editor Code' }));
    await expect.poll(() => rows('Editor Code')).toEqual([]);
    const last = rows('Application').at(-1) ?? '';
    const first = rows('Editor Compare')[0] ?? '';

    await userEvent.click(row(last));
    await userEvent.keyboard('{ArrowDown}');

    await expect.element(row(first)).toHaveAttribute('aria-selected', 'true');
    await expect.element(row(first)).toHaveFocus();
    await expect.element(row(last)).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{ArrowUp}');
    await expect.element(row(last)).toHaveAttribute('aria-selected', 'true');
    await expect.element(row(last)).toHaveFocus();
  });

  test('moves selection to first and last row with Home and End', async () => {
    await mount();
    await userEvent.click(row(FIND));

    await userEvent.keyboard('{End}');
    const last = rows('Workspace').at(-1) ?? '';
    await expect.element(row(last)).toHaveAttribute('aria-selected', 'true');
    await expect.element(row(last)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    await expect.element(row(SETTINGS)).toHaveFocus();
    expect(rows('Application')[0]).toBe(SETTINGS);
  });

  test('lists add shortcut and remove per key, then reset', async () => {
    await mount(SELECT_MINE);

    await userEvent.click(row(FIND), { button: 'right' });

    await expect.element(page.getByRole('menu')).toBeVisible();
    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'true');
    expect(
      page
        .getByRole('menuitem')
        .elements()
        .map((item) => [...item.childNodes].map((node) => node.textContent)),
    ).toEqual([
      ['Add shortcut…', formatKey('Enter')],
      ['Remove', formatKey('Mod-Shift-x')],
      ['Remove', formatKey('F9'), formatKey('Mod-Backspace')],
      ['Reset'],
      ['Undo', formatKey('Mod-z')],
      ['Redo', formatKey('Mod-Shift-z')],
    ]);
    expect(page.getByRole('separator').elements()).toHaveLength(2);
  });

  test('removes key from menu', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);

    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: new RegExp(`^Remove ${formatKey('F9')}`) }));

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('mine', { name: 'Mine', keys: { [FIND]: ['Mod-Shift-x'] } });
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x')]);
  });

  test('marks modified and resets entry from menu', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);
    await expect.element(row(FIND).getByRole('img', { name: 'Modified' })).toBeVisible();

    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: 'Reset' }));

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('mine', { name: 'Mine', keys: {} });
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-f')]);
    await expect.element(row(FIND).getByRole('img', { name: 'Modified' })).not.toBeInTheDocument();
  });

  test('disables reset without entry', async () => {
    await mount();

    await userEvent.click(row(FIND), { button: 'right' });

    await expect.element(page.getByRole('menuitem', { name: 'Reset' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('removes last key with Mod-Backspace', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);

    await userEvent.click(row(FIND));
    await userEvent.keyboard('{Meta>}{Backspace}{/Meta}');

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('mine', { name: 'Mine', keys: { [FIND]: ['Mod-Shift-x'] } });
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x')]);
  });

  test('records key on double-click', async () => {
    await mount(SELECT_MINE);

    await userEvent.dblClick(row(FIND));
    await expect.element(field()).toHaveFocus();
    await expect.element(page.getByRole('heading', { name: 'Add shortcut to “Find…”' })).toBeVisible();
    await expect.element(page.getByText('Esc cancel', { exact: true })).toBeVisible();
    await userEvent.keyboard('{Meta>}{Shift>}k{/Shift}{/Meta}');

    await expect.element(field()).toHaveValue(formatKey('Mod-Shift-k'));
    await expect.element(page.getByText('↩ add · Esc clear')).toBeVisible();
  });

  test('applies key on Enter', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);
    await userEvent.click(row(FIND));
    await userEvent.keyboard('{Enter}');
    await expect.element(field()).toHaveFocus();

    await userEvent.keyboard('{Meta>}{Shift>}k{/Shift}{/Meta}{Enter}');

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('mine', {
      name: 'Mine',
      keys: { [FIND]: ['Mod-Shift-x', 'F9', 'Mod-Shift-k'] },
    });
    await expect.element(field()).not.toBeInTheDocument();
    await expect.element(row(FIND)).toHaveFocus();
    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'true');
  });

  test('keeps one of equivalent keys', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE, [], { name: 'Mine', keys: { [FIND]: ['Mod-K'] } });
    await userEvent.dblClick(row(FIND));
    await expect.element(field()).toHaveFocus();

    await userEvent.keyboard('{Meta>}{Shift>}k{/Shift}{/Meta}{Enter}');

    await expect.element(field()).not.toBeInTheDocument();
    expect(saveUserKeymap).not.toHaveBeenCalled();
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-K')]);
  });

  test('clears key on Escape, then cancels', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);
    await userEvent.dblClick(row(FIND));
    await expect.element(field()).toHaveFocus();

    await userEvent.keyboard('{F7}{Escape}');
    await expect.element(field()).toHaveValue('');
    await expect.element(page.getByText('Esc cancel', { exact: true })).toBeVisible();

    await userEvent.keyboard('{Escape}');

    await expect.element(field()).not.toBeInTheDocument();
    await expect.element(row(FIND)).toHaveFocus();
    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'true');
    expect(saveUserKeymap).not.toHaveBeenCalled();
  });

  test('ignores modifier alone', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);
    await userEvent.dblClick(row(FIND));
    await expect.element(field()).toHaveFocus();

    await userEvent.keyboard('{Shift}{Meta}{Enter}');

    await expect.element(field()).toHaveValue('');
    await expect.element(field()).toHaveFocus();
    expect(saveUserKeymap).not.toHaveBeenCalled();
  });

  test('adds key from menu', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);

    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: /^Add shortcut…/ }));
    await expect.element(field()).toHaveFocus();
    await userEvent.keyboard('{F7}{Enter}');

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('mine', {
      name: 'Mine',
      keys: { [FIND]: ['Mod-Shift-x', 'F9', 'F7'] },
    });
    await expect.element(row(FIND)).toHaveFocus();
    await expect.element(row(FIND)).toHaveAttribute('aria-selected', 'true');
  });

  test('notes conflicting key with other command in scope', async () => {
    await mount(SELECT_MINE, [], SHARING);

    await expect
      .element(row(FIND).getByRole('note'))
      .toHaveTextContent(`${formatKey('F9')} conflicts with Duplicate line·Remove from Duplicate line`);
    expect(row(FIND).getByRole('note').elements()).toHaveLength(1);
    await expect
      .element(row(DUPLICATE).getByRole('note'))
      .toHaveTextContent(`${formatKey('F9')} conflicts with Find…·Remove from Find…`);
    expect(row(COPY).getByRole('note').elements()).toHaveLength(0);
  });

  test('removes key from other command through note', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE, [], SHARING);

    await userEvent.click(row(FIND).getByRole('button', { name: 'Remove from Duplicate line' }));

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('mine', { ...SHARING, keys: { ...SHARING.keys, [DUPLICATE]: [] } });
    await expect.element(row(FIND).getByRole('note')).not.toBeInTheDocument();
    await expect.element(row(FIND)).toHaveFocus();
  });

  test('keeps row height with and without notes', async () => {
    await mount(SELECT_MINE, [], SHARING);
    await expect.element(row(FIND).getByRole('note')).toBeVisible();

    const noted = row(FIND).element().getBoundingClientRect();
    const label = row(FIND).getByText('Find…', { exact: true }).element().getBoundingClientRect();
    expect(row(SETTINGS).element().getBoundingClientRect().height).toBe(32);
    expect(row(COPY).element().getBoundingClientRect().height).toBe(32);
    expect(noted.height).toBeGreaterThan(32);
    expect(label.top + label.height / 2 - noted.top).toBe(16);
  });

  test('undoes removal with Mod-z', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);
    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: new RegExp(`^Remove ${formatKey('F9')}`) }));
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x')]);
    await expect.element(row(FIND)).toHaveFocus();

    await userEvent.keyboard('{Meta>}z{/Meta}');

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(2);
    expect(saveUserKeymap).toHaveBeenLastCalledWith('mine', MINE);
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x'), formatKey('F9')]);
  });

  test('redoes removal with Mod-Shift-z', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);
    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: new RegExp(`^Remove ${formatKey('F9')}`) }));
    await expect.element(row(FIND)).toHaveFocus();
    await userEvent.keyboard('{Meta>}z{/Meta}');
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x'), formatKey('F9')]);

    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(3);
    expect(saveUserKeymap).toHaveBeenLastCalledWith('mine', { name: 'Mine', keys: { [FIND]: ['Mod-Shift-x'] } });
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x')]);
  });

  test('drops redo after new edit', async () => {
    await mount(SELECT_MINE);
    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: new RegExp(`^Remove ${formatKey('F9')}`) }));
    await expect.element(row(FIND)).toHaveFocus();
    await userEvent.keyboard('{Meta>}z{/Meta}');
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x'), formatKey('F9')]);

    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: new RegExp(`^Remove ${formatKey('Mod-Shift-x')}`) }));
    await expect.poll(() => keys(FIND)).toEqual([formatKey('F9')]);
    await userEvent.click(row(FIND), { button: 'right' });

    await expect.element(page.getByRole('menuitem', { name: /^Redo/ })).toHaveAttribute('aria-disabled', 'true');
  });

  test('clears history on keymap change', async () => {
    await mount(SELECT_MINE, [PLUGIN]);
    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: new RegExp(`^Remove ${formatKey('F9')}`) }));
    await expect.poll(() => keys(FIND)).toEqual([formatKey('Mod-Shift-x')]);

    await userEvent.click(page.getByRole('combobox', { name: 'Keymap' }));
    await userEvent.click(page.getByRole('group', { name: 'Example' }).getByRole('option', { name: 'Vim' }));
    await expect.poll(shown).toBe('Vim');
    await userEvent.click(row(FIND), { button: 'right' });

    await expect.element(page.getByRole('menuitem', { name: /^Undo/ })).toHaveAttribute('aria-disabled', 'true');
  });

  test('copies plugin keymap on remove', async () => {
    const { save, saveUserKeymap } = await mount(SELECT_VIM, [PLUGIN]);

    await userEvent.click(row(FIND), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: new RegExp(`^Remove ${formatKey('F9')}`) }));

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('vim-copy', { name: 'Vim copy', keys: { [FIND]: [] } });
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith({ ...SELECT_VIM, keymap: { source: 'user', id: 'vim-copy' } });
  });

  test('collapses section', async () => {
    await mount();
    await expect.poll(() => document.getElementById(SETTINGS)).not.toBeNull();

    await userEvent.click(page.getByRole('button', { name: 'Application' }));

    await expect.poll(() => document.getElementById(SETTINGS)).toBeNull();
    await expect.element(page.getByRole('button', { name: 'Terminal' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('renames user keymap in place', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);

    await userEvent.click(page.getByRole('button', { name: 'Keymap actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Rename…' }));
    await expect.element(page.getByRole('textbox', { name: 'Keymap name' })).toHaveFocus();
    await userEvent.keyboard('Ours{Enter}');

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('mine', { ...MINE, name: 'Ours' });
    await expect.poll(shown).toBe('Ours');
  });

  test('cancels rename with Escape', async () => {
    const { saveUserKeymap } = await mount(SELECT_MINE);

    await userEvent.click(page.getByRole('button', { name: 'Keymap actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Rename…' }));
    await expect.element(page.getByRole('textbox', { name: 'Keymap name' })).toHaveFocus();
    await userEvent.keyboard('Ours{Escape}');

    await expect.poll(shown).toBe('Mine');
    expect(page.getByRole('textbox', { name: 'Keymap name' }).elements()).toHaveLength(0);
    expect(saveUserKeymap).not.toHaveBeenCalled();
  });

  test('filters rows by label', async () => {
    await mount();
    await expect.poll(options).toContain(SETTINGS);

    await userEvent.fill(search(), '  DUPLICATE line ');

    await expect.poll(options).toEqual([DUPLICATE, `${DUPLICATE}Up`]);
  });

  test('hides sections without matches', async () => {
    await mount();
    await expect.poll(options).toContain(SETTINGS);

    await userEvent.fill(search(), 'duplicate line');

    await expect.poll(headings).toEqual([['Editor', 'Edit']]);
  });

  test('matches section by group label', async () => {
    await mount(DEFAULT_FRONTEND_SETTINGS, [PLUGIN]);
    await expect.element(page.getByRole('heading', { name: 'Example Tone' })).toBeVisible();

    await userEvent.fill(search(), 'tone');

    await expect.poll(headings).toEqual([['Example', 'Tone']]);
    expect(rows('Example Tone')).toEqual(['io.example.uwu']);
  });

  test('shows no results message under toolbar', async () => {
    await mount();
    await expect.poll(options).toContain(SETTINGS);
    const main = page.getByRole('main').element();
    const toolbar = page.getByRole('button', { name: 'Search by shortcut' }).element().parentElement as HTMLElement;
    main.scrollTop = main.scrollHeight;
    await expect.poll(() => toolbar.getBoundingClientRect().top).toBe(main.getBoundingClientRect().top);

    await userEvent.fill(search(), 'zzz');

    const message = page.getByText('No commands found');
    await expect.element(message).toBeVisible();
    expect(headings()).toEqual([]);
    expect(message.element().getBoundingClientRect().top).toBe(toolbar.getBoundingClientRect().bottom);
  });

  test('searches by key', async () => {
    await mount(SELECT_MINE);
    await expect.poll(options).toContain(SETTINGS);

    await userEvent.click(page.getByRole('button', { name: 'Search by shortcut' }));
    await expect.element(search()).toHaveFocus();
    await userEvent.keyboard('{F9}');

    await expect.element(search()).toHaveValue(formatKey('F9'));
    await expect.poll(options).toEqual([FIND]);
  });

  test('clears key with Escape, then leaves key search', async () => {
    await mount(SELECT_MINE);
    const toggle = page.getByRole('button', { name: 'Search by shortcut' });
    await userEvent.click(toggle);
    await userEvent.keyboard('{F9}');
    await expect.poll(options).toEqual([FIND]);

    await userEvent.keyboard('{Escape}');
    await expect.element(search()).toHaveValue('');
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(options).toContain(SETTINGS);

    await userEvent.keyboard('{Escape}');

    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect.element(search()).toHaveAttribute('placeholder', 'Search commands');
    await userEvent.keyboard('duplicate line');
    await expect.element(search()).toHaveValue('duplicate line');
  });

  test('sticks heading under toolbar while scrolling', async () => {
    await mount();
    const heading = page.getByRole('heading', { name: 'Editor Edit' });
    await expect.element(heading).toBeVisible();
    const main = page.getByRole('main').element();
    const toolbar = page.getByRole('button', { name: 'Search by shortcut' }).element().parentElement as HTMLElement;

    main.scrollTop += heading.element().getBoundingClientRect().top - main.getBoundingClientRect().top + 100;

    await expect.poll(() => toolbar.getBoundingClientRect().top).toBe(main.getBoundingClientRect().top);
    expect(toolbar.getBoundingClientRect().height).toBe(44);
    expect(heading.element().getBoundingClientRect().top).toBe(toolbar.getBoundingClientRect().bottom);
  });

  test('keeps toolbar still when search shrinks list', async () => {
    await mount();
    const main = page.getByRole('main').element();
    const toolbar = page.getByRole('button', { name: 'Search by shortcut' }).element().parentElement as HTMLElement;
    main.scrollTop = main.scrollHeight;
    await expect.poll(() => toolbar.getBoundingClientRect().top).toBe(main.getBoundingClientRect().top);
    const before = main.scrollTop;

    await userEvent.fill(search(), 'Settings');

    await expect.poll(() => options()).toEqual([SETTINGS]);
    expect(toolbar.getBoundingClientRect().top).toBe(main.getBoundingClientRect().top);
    expect(main.scrollTop).toBeGreaterThan(0);
    expect(main.scrollTop).toBeLessThanOrEqual(before);
  });

  test('starts results under toolbar as search changes', async () => {
    await mount();
    const main = page.getByRole('main').element();
    const toolbar = page.getByRole('button', { name: 'Search by shortcut' }).element().parentElement as HTMLElement;
    const results = toolbar.parentElement as HTMLElement;
    main.scrollTop = main.scrollHeight / 2;
    await expect.poll(() => toolbar.getBoundingClientRect().top).toBe(main.getBoundingClientRect().top);

    for (const text of ['m', 'mo']) {
      await userEvent.fill(search(), text);
      await expect.poll(() => results.getBoundingClientRect().top).toBe(main.getBoundingClientRect().top);
      expect(toolbar.getBoundingClientRect().top).toBe(main.getBoundingClientRect().top);
    }
  });

  test('focuses search on Mod-f', async () => {
    await mount();
    await userEvent.fill(search(), 'find');
    await userEvent.click(row(FIND));

    await userEvent.keyboard('{Meta>}f{/Meta}');

    await expect.element(search()).toHaveFocus();
    const input = search().element() as HTMLInputElement;
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
    await expect.element(page.getByRole('combobox', { name: 'Search' })).not.toHaveFocus();
  });
});
