import { setDiagnostics } from '@codemirror/lint';
import { openSearchPanel, search } from '@codemirror/search';
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
import { hover } from '@/editor/hover';
import { useDiagnosticsSummary } from '@/editor/stripe/diagnostics-summary';
import { METRICS } from '@/editor/theme';
import { settingsQuery } from '@/settings/settings';
import { builtInCommands, commandsExtension } from '../../../test/commands';

const DOC = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

// Mounts `DOC` in an editor 200px high with the summary, under `settings`.
function mount(settings: Settings = DEFAULT_SETTINGS, extensions: Extension = []): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  const commands = builtInCommands();
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  function Probe() {
    const { summary, portal } = useDiagnosticsSummary();
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const created = new EditorView({
        state: EditorState.create({
          doc: DOC,
          extensions: [
            summary,
            METRICS,
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
    }, [summary]);
    return (
      <QueryClientProvider client={client}>
        <CommandManagerContext value={commands}>
          <div ref={host} />
          {portal}
        </CommandManagerContext>
      </QueryClientProvider>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Probe />
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

describe('useDiagnosticsSummary', () => {
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

  test('ticks without diagnostics, hiding arrows', async () => {
    await mount();

    await expect.element(status()).toHaveAccessibleName('No diagnostics');
    expect(document.querySelector('[data-slot=diagnostics-summary] svg')).not.toBeNull();
    expect(document.querySelectorAll('[data-slot=diagnostics-summary] button')).toHaveLength(0);
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

  test('sits at top of code, below search bar', async () => {
    const view = await mount(DEFAULT_SETTINGS, search({ top: true }));
    const summary = view.dom.querySelector('.cm-diagnostics-summary') as HTMLElement;
    const top = () => summary.getBoundingClientRect().top - view.scrollDOM.getBoundingClientRect().top;
    await vi.waitFor(() => expect(top()).toBeGreaterThanOrEqual(0));
    const above = top();

    openSearchPanel(view);

    const panel = view.dom.querySelector('.cm-panels-top') as HTMLElement;
    await vi.waitFor(() =>
      expect(summary.getBoundingClientRect().top).toBeGreaterThanOrEqual(panel.getBoundingClientRect().bottom),
    );
    // Within the rounding of the panel's height.
    expect(Math.abs(top() - above)).toBeLessThan(1);
  });

  test('hidden with stripe', async () => {
    const view = await mount({
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        editor: { ...DEFAULT_SETTINGS.appearance.editor, stripe: false },
      },
    });

    expect(view.dom.querySelector('.cm-diagnostics-summary')).toBeNull();
  });
});
