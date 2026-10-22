import { openSearchPanel, search } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import type { EditorCommand, EditorToolbarProps } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { type CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { METRICS } from '@/editor/theme';
import { useToolbarExtension } from '@/editor/toolbar';
import { settingsQuery } from '@/settings/settings';
import { builtInCommands, commandsExtension } from '../../test/commands';

// An icon.
function Dot(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="4" />
    </svg>
  );
}

const DOC = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

// Mounts `DOC` in an editor 200px high with the toolbar of `editor` and `commands`, and `extensions`.
function mount(
  editor = new EditorManager(),
  commands = builtInCommands(editor),
  extensions: Extension = [],
): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_SETTINGS);
  function Probe() {
    const { toolbar, portal } = useToolbarExtension();
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const created = new EditorView({
        state: EditorState.create({
          doc: DOC,
          extensions: [
            toolbar,
            METRICS,
            commandsExtension(commands),
            EditorView.theme({ '&': { height: '200px' } }),
            extensions,
          ],
        }),
        parent: host.current as HTMLDivElement,
      });
      resolve(created);
      return () => created.destroy();
    }, [toolbar]);
    return (
      <>
        <div ref={host} />
        {portal}
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <Probe />
        </CommandManagerContext>
      </EditorManagerContext>
    </QueryClientProvider>,
  );
  return ready;
}

// Adds an editor command with `id` as its label, and `parts`, to `commands`.
function command(commands: CommandManager, id: string, parts: Partial<EditorCommand> = {}): EditorCommand {
  const added: EditorCommand = { scope: 'editor', id, label: id, run: () => true, ...parts };
  commands.add([added]);
  return added;
}

// Returns the toolbar's items, each by its label or slot.
function items(): (string | null)[] {
  return [...document.querySelectorAll('[data-slot=toolbar] > *')].map(
    (item) => item.getAttribute('aria-label') ?? item.getAttribute('data-slot'),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useToolbar', () => {
  test('orders items from right edge, unordered left', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a');
    command(commands, 'b');
    command(commands, 'c');
    editor.addToolbarItems([
      { type: 'command', command: 'c', icon: Dot },
      { type: 'command', order: 20, command: 'a', icon: Dot },
      { type: 'command', order: 5, command: 'b', icon: Dot },
    ]);
    await mount(editor, commands);

    await vi.waitFor(() => expect(items()).toEqual(['c', 'a', 'diagnostics-summary', 'b']));
  });

  test('tabs from left to right', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a');
    command(commands, 'b');
    editor.addToolbarItems([
      { type: 'command', order: 20, command: 'a', icon: Dot },
      { type: 'command', order: 30, command: 'b', icon: Dot },
    ]);
    await mount(editor, commands);
    (await page.getByRole('button', { name: 'b' }).element()).focus();

    await userEvent.keyboard('{Tab}');

    expect(document.activeElement?.getAttribute('aria-label')).toBe('a');
  });

  test('hides command not shown, following edits', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a', { shown: (_, view) => view.state.doc.length === 0 });
    editor.addToolbarItems([{ type: 'command', command: 'a', icon: Dot }]);
    const view = await mount(editor, commands);
    await expect.element(page.getByRole('status')).toBeInTheDocument();
    expect(items()).toEqual(['diagnostics-summary']);

    view.dispatch({ changes: { from: 0, to: view.state.doc.length } });

    await expect.element(page.getByRole('button', { name: 'a' })).toBeInTheDocument();
  });

  test('disables command not enabled', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a', { enabled: () => false });
    editor.addToolbarItems([{ type: 'command', command: 'a', icon: Dot }]);
    await mount(editor, commands);

    await expect.element(page.getByRole('button', { name: 'a' })).toBeDisabled();
  });

  test('runs command, keeping editor focused', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    const run = vi.fn(() => true);
    command(commands, 'a', { run });
    editor.addToolbarItems([{ type: 'command', command: 'a', icon: Dot }]);
    const view = await mount(editor, commands);
    view.focus();

    await userEvent.click(page.getByRole('button', { name: 'a' }));

    expect(run).toHaveBeenCalledWith(commands.application, view, null);
    expect(view.hasFocus).toBe(true);
  });

  test('shows label and key in tooltip', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a', { label: 'Shrug', defaultKeys: ['Shift-F9'] });
    editor.addToolbarItems([{ type: 'command', command: 'a', icon: Dot }]);
    await mount(editor, commands);

    await userEvent.hover(page.getByRole('button', { name: 'Shrug' }));

    await vi.waitFor(() => {
      const tooltip = document.querySelector('[data-slot=tooltip-content]');
      expect(tooltip?.textContent).toContain('Shrug');
      expect(tooltip?.querySelector('[data-slot=kbd]')).not.toBeNull();
    });
  });

  test('shows neighbouring tooltip instantly', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a', { label: 'Shrug' });
    command(commands, 'b', { label: 'Wave' });
    editor.addToolbarItems([
      { type: 'command', command: 'a', icon: Dot },
      { type: 'command', command: 'b', icon: Dot },
    ]);
    await mount(editor, commands);
    await userEvent.hover(page.getByRole('button', { name: 'Shrug' }));
    await expect.element(page.getByText('Shrug', { exact: true })).toBeVisible();

    await userEvent.hover(page.getByRole('button', { name: 'Wave' }));

    await expect.element(page.getByText('Wave', { exact: true })).toHaveAttribute('data-instant');
  });

  test('removes items when disposed', async () => {
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a');
    const dispose = editor.addToolbarItems([{ type: 'command', command: 'a', icon: Dot }]);
    await mount(editor, commands);
    await expect.element(page.getByRole('button', { name: 'a' })).toBeInTheDocument();

    dispose();

    await expect.element(page.getByRole('button', { name: 'a' })).not.toBeInTheDocument();
  });

  test('skips unknown command', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    editor.addToolbarItems([{ type: 'command', command: 'missing', icon: Dot }]);
    await mount(editor);

    await expect.element(page.getByRole('status')).toBeInTheDocument();
    expect(items()).toEqual(['diagnostics-summary']);
    expect(warn).toHaveBeenCalledWith('Unknown command missing in toolbar');
  });

  test('skips duplicate id, first wins', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    const commands = builtInCommands(editor);
    command(commands, 'a');
    editor.addToolbarItems([
      { type: 'command', command: 'a', icon: Dot },
      { type: 'component', id: 'a', component: () => <span data-slot="duplicate" /> },
      { type: 'command', command: 'a', icon: Dot },
    ]);
    await mount(editor, commands);

    await expect.element(page.getByRole('button', { name: 'a' })).toBeInTheDocument();
    expect(items()).toEqual(['a', 'diagnostics-summary']);
    expect(warn).toHaveBeenCalledWith('Toolbar item a was already added');
  });

  test('lets component take focus', async () => {
    function Field() {
      return <input aria-label="Field" />;
    }
    const editor = new EditorManager();
    editor.addToolbarItems([{ type: 'component', id: 'field', component: Field }]);
    const view = await mount(editor);
    view.focus();

    await userEvent.click(page.getByRole('textbox', { name: 'Field' }));

    await expect.element(page.getByRole('textbox', { name: 'Field' })).toHaveFocus();
  });

  test('passes editor updates to component', async () => {
    function Length({ view, subscribe }: EditorToolbarProps) {
      const [length, setLength] = useState(view.state.doc.length);
      useEffect(() => subscribe((update) => setLength(update.state.doc.length)), [subscribe]);
      return <span data-slot="length">{length}</span>;
    }
    const editor = new EditorManager();
    editor.addToolbarItems([{ type: 'component', id: 'length', component: Length }]);
    const view = await mount(editor);
    await expect.element(page.getByText(String(DOC.length))).toBeInTheDocument();

    view.dispatch({ changes: { from: 0, insert: 'abc' } });

    await expect.element(page.getByText(String(DOC.length + 3))).toBeInTheDocument();
  });

  test('hides throwing component, keeping others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): never {
      throw new Error('broken');
    }
    const editor = new EditorManager();
    editor.addToolbarItems([{ type: 'component', id: 'broken', component: Broken }]);
    await mount(editor);

    await expect.element(page.getByRole('status')).toBeInTheDocument();
    expect(error).toHaveBeenCalledWith('Toolbar item broken failed', expect.any(Error));
  });

  test('sits at top of code, below search bar', async () => {
    const view = await mount(undefined, undefined, search({ top: true }));
    const toolbar = view.dom.querySelector('.cm-toolbar') as HTMLElement;
    const top = () => toolbar.getBoundingClientRect().top - view.scrollDOM.getBoundingClientRect().top;
    await vi.waitFor(() => expect(top()).toBeGreaterThanOrEqual(0));
    const above = top();

    openSearchPanel(view);

    const panel = view.dom.querySelector('.cm-panels-top') as HTMLElement;
    await vi.waitFor(() =>
      expect(toolbar.getBoundingClientRect().top).toBeGreaterThanOrEqual(panel.getBoundingClientRect().bottom),
    );
    // Within the rounding of the panel's height.
    expect(Math.abs(top() - above)).toBeLessThan(1);
  });
});
