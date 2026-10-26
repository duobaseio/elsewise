import { setDiagnostics } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import type { EditorDiagnostic } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CommandManagerContext } from '@/command/command-manager';
import { diagnostics } from '@/editor/diagnostics';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { hover } from '@/editor/hover';
import { METRICS } from '@/editor/theme';
import { useToolbarExtension } from '@/editor/toolbar';
import { settingsQuery } from '@/settings/settings';
import { builtInCommands, commandsExtension } from '../../../test/commands';

const DOC = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

// Mounts `DOC` in an editor 200px high with the toolbar, under `settings` held by `client`.
function mount(
  settings: Settings = DEFAULT_SETTINGS,
  extensions: Extension = [],
  client = new QueryClient(),
): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  const editor = new EditorManager();
  const commands = builtInCommands(editor);
  client.setQueryData(settingsQuery.queryKey, settings);
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
            diagnostics,
            hover(),
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

// Returns a diagnostic over the `line`th line of `DOC`, from 1.
function at(line: number, severity: EditorDiagnostic['severity'] = 'error') {
  const from = DOC.indexOf(`line ${line}\n`);
  return { from, to: from + `line ${line}`.length, severity, message: `${severity} ${line}` };
}

const status = () => page.getByRole('status');

// Returns the summary's `name` part.
const part = (name: 'summary' | 'tick' | 'counts') =>
  document.querySelector<HTMLElement>(`[data-slot=diagnostics-${name}]`);

describe('DiagnosticsSummary', () => {
  test('counts by severity, leaving hints out', async () => {
    const view = await mount();

    view.dispatch(setDiagnostics(view.state, [at(1), at(2), at(3, 'warning'), at(4, 'info'), at(5, 'hint')]));

    await expect.element(status()).toHaveAccessibleName('2 errors, 1 warning, 1 info');
    await expect.element(status()).toHaveTextContent('211');
  });

  test('recounts when edit drops diagnostic', async () => {
    const view = await mount();
    view.dispatch(setDiagnostics(view.state, [at(1), at(2)]));
    await expect.element(status()).toHaveAccessibleName('2 errors');

    // Deletes the first diagnostic's text, which the lint field drops.
    view.dispatch({ changes: { from: at(1).from, to: at(1).to } });

    await expect.element(status()).toHaveAccessibleName('1 error');
  });

  test('ticks without diagnostics, disabling arrows', async () => {
    await mount();

    await expect.element(status()).toHaveAccessibleName('No diagnostics');
    expect(part('tick')).not.toBeNull();
    await expect.element(page.getByRole('button', { name: 'Previous diagnostic' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Next diagnostic' })).toBeDisabled();
  });

  test('keeps arrows in place', async () => {
    const view = await mount();
    const next = page.getByRole('button', { name: 'Next diagnostic' });
    await expect.element(next).toBeDisabled();
    const before = next.element().getBoundingClientRect().left;

    view.dispatch(setDiagnostics(view.state, [at(1), at(2, 'warning')]));

    await expect.element(next).toBeEnabled();
    expect(next.element().getBoundingClientRect().left).toBe(before);
  });

  test('skips animation when opened', async () => {
    await mount();
    await expect.element(status()).toHaveAccessibleName('No diagnostics');

    expect(part('summary')?.getAnimations({ subtree: true })).toHaveLength(0);
    expect(getComputedStyle(part('tick') as HTMLElement).opacity).toBe('1');
  });

  test('fades arrows in with counts', async () => {
    const view = await mount();
    const next = page.getByRole('button', { name: 'Next diagnostic' });
    await expect.element(next).toBeDisabled();

    view.dispatch(setDiagnostics(view.state, [at(1)]));

    await expect.element(next).toBeEnabled();
    expect(Number(getComputedStyle(next.element()).opacity)).toBeLessThan(1);
    await vi.waitFor(() => expect(getComputedStyle(next.element()).opacity).toBe('1'));
  });

  test('crossfades tick and counts', async () => {
    const view = await mount();
    await expect.element(status()).toHaveAccessibleName('No diagnostics');

    view.dispatch(setDiagnostics(view.state, [at(1)]));

    await vi.waitFor(() => expect(part('counts')).not.toBeNull());
    expect(part('tick')).not.toBeNull();
    expect(Number(getComputedStyle(part('counts') as HTMLElement).opacity)).toBeLessThan(1);
    await vi.waitFor(() => expect(part('tick')).toBeNull());
  });

  test('keeps counts while leaving', async () => {
    const view = await mount();
    view.dispatch(setDiagnostics(view.state, [at(1)]));
    await expect.element(page.getByRole('button', { name: 'Next diagnostic' })).toBeEnabled();

    view.dispatch(setDiagnostics(view.state, []));

    await expect.element(status()).toHaveAccessibleName('No diagnostics');
    expect(part('counts')?.textContent).toBe('1');
    await vi.waitFor(() => expect(part('counts')).toBeNull());
    await expect.element(page.getByRole('button', { name: 'Next diagnostic' })).toBeDisabled();
  });

  test('steps through diagnostics, keeping editor focused', async () => {
    const view = await mount();
    view.dispatch(setDiagnostics(view.state, [at(10), at(20)]));
    view.focus();

    await userEvent.click(page.getByRole('button', { name: 'Next diagnostic' }), { delay: 100 });
    expect(view.state.selection.main.head).toBe(at(10).from);
    await userEvent.click(page.getByRole('button', { name: 'Previous diagnostic' }), { delay: 100 });
    expect(view.state.selection.main.head).toBe(at(20).from);
    expect(view.hasFocus).toBe(true);
  });

  test('hidden with stripe', async () => {
    await mount({
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        editor: { ...DEFAULT_SETTINGS.appearance.editor, stripe: false },
      },
    });

    await vi.waitFor(() => expect(document.querySelector('[data-slot=toolbar]')).not.toBeNull());
    expect(document.querySelector('[data-slot=diagnostics-summary]')).toBeNull();
  });

  test('hidden when read-only', async () => {
    await mount(DEFAULT_SETTINGS, EditorState.readOnly.of(true));

    await vi.waitFor(() => expect(document.querySelector('[data-slot=toolbar]')).not.toBeNull());
    expect(document.querySelector('[data-slot=diagnostics-summary]')).toBeNull();
  });

  test('recounts when shown again', async () => {
    const hidden = {
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance, editor: { ...DEFAULT_SETTINGS.appearance.editor, stripe: false } },
    };
    const client = new QueryClient();
    const view = await mount(hidden, [], client);
    await vi.waitFor(() => expect(document.querySelector('[data-slot=toolbar]')).not.toBeNull());

    view.dispatch(setDiagnostics(view.state, [at(1), at(2, 'warning')]));
    client.setQueryData(settingsQuery.queryKey, DEFAULT_SETTINGS);

    await expect.element(status()).toHaveAccessibleName('1 error, 1 warning');
  });
});
