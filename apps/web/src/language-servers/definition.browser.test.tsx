import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { type StubTransport, stubTransport } from '../../test/stub-transport';

const ROOT = new URL('file:///worktree/');

const URI = 'file:///worktree/main.rs';

// `total` is used on the first line, and defined on line 101 of 201.
const DOC = `total + 1${'\n'.repeat(100)}let total = 1;${'\n'.repeat(100)}`;

// Returns a transport to a server that finds `total` defined on line 101 of `DOC`.
function transport(): StubTransport {
  return stubTransport(
    { textDocumentSync: 2, definitionProvider: true },
    {
      'textDocument/definition': () => ({
        uri: URI,
        range: { start: { line: 100, character: 4 }, end: { line: 100, character: 9 } },
      }),
    },
  );
}

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

describe('serverDefinition', () => {
  test('scrolls a definition out of view to the middle of the editor', async () => {
    const instance = new LanguageServerInstance(
      { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: transport } satisfies LanguageServer,
      ROOT,
    );
    await instance.start();
    await instance.client.initializing;
    const view = new EditorView({
      state: EditorState.create({
        doc: DOC,
        selection: { anchor: 2 },
        extensions: [instance.client.plugin(URI, 'rust'), EditorView.theme({ '&': { height: '200px' } })],
      }),
      parent: document.body,
    });
    views.push(view);

    expect(runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'F12' }), 'editor')).toBe(true);

    await vi.waitFor(() => {
      expect(view.state.selection.main.head).toBe(DOC.indexOf('total = 1'));
      const definition = view.coordsAtPos(view.state.selection.main.head);
      const bounds = view.scrollDOM.getBoundingClientRect();
      expect(definition).not.toBeNull();
      expect(Math.abs((definition?.top ?? 0) - (bounds.top + bounds.height / 2))).toBeLessThan(20);
    });
  });
});
