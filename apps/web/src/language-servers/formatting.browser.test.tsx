import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { OS } from '@elsewise/components/lib/os';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { stubTransport } from '../../test/stub-transport';

const URI = 'file:///worktree/main.rs';

const DOC = 'let  total=1;';

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
  vi.restoreAllMocks();
});

// Opens `DOC` on a server with `capabilities` that formats it with `format`.
async function open(capabilities: object, format: () => unknown): Promise<EditorView> {
  const instance = new LanguageServerInstance(
    {
      id: 'rust',
      name: 'Rust',
      languages: { Rust: 'rust' },
      start: () => stubTransport(capabilities, { 'textDocument/formatting': format }),
    } satisfies LanguageServer,
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: [instance.client.plugin(URI, 'rust'), history()] }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Presses Mod-Alt-L.
function press(view: EditorView): boolean {
  const event = new KeyboardEvent('keydown', { key: 'l', altKey: true, metaKey: OS === 'mac', ctrlKey: OS !== 'mac' });
  return runScopeHandlers(view, event, 'editor');
}

describe('serverFormatting', () => {
  test("applies the server's edits in one undo step", async () => {
    const view = await open({ documentFormattingProvider: true }, () => [
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 5 } }, newText: ' ' },
      { range: { start: { line: 0, character: 10 }, end: { line: 0, character: 11 } }, newText: ' = ' },
    ]);

    expect(press(view)).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let total = 1;'));
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('says when formatting failed', async () => {
    const add = vi.spyOn(toast, 'add');
    const view = await open({ documentFormattingProvider: true }, () => Promise.reject(new Error('No formatter')));

    expect(press(view)).toBe(true);

    await vi.waitFor(() => {
      expect(add).toHaveBeenCalledWith({
        type: 'error',
        title: 'Formatting request failed',
        description: 'No formatter',
      });
    });
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test("doesn't ask a server that can't format", async () => {
    const format = vi.fn(() => []);
    const view = await open({}, format);

    press(view);
    await new Promise(requestAnimationFrame);

    expect(format).not.toHaveBeenCalled();
  });
});
