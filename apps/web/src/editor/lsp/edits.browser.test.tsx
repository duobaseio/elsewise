import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test } from 'vitest';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { StubTransport } from '../../../test/stub-transport';

const URI = 'file:///worktree/main.ts';

const CLOSED = 'file:///worktree/closed.ts';

const DOC = 'const total = 1;\nconst other = 2;';

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` on a server.
async function open(): Promise<{ instance: LanguageServerInstance; view: EditorView; stub: StubTransport }> {
  const stub = new StubTransport({ textDocumentSync: 2 });
  const instance = new LanguageServerInstance(
    {
      id: 'ts',
      name: 'TypeScript',
      languages: { TypeScript: 'typescript' },
      start: () => stub,
    } satisfies LanguageServer,
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: [instance.client.plugin(URI, 'typescript'), history()] }),
    parent: document.body,
  });
  views.push(view);
  return { instance, view, stub };
}

// Returns the edit that replaces `line`'s `from` to `to` with `newText`.
function edit(line: number, from: number, to: number, newText: string) {
  return { range: { start: { line, character: from }, end: { line, character: to } }, newText };
}

function applyEdit(stub: StubTransport, edit: WorkspaceEdit) {
  return stub.request('workspace/applyEdit', { edit });
}

describe('workspace/applyEdit', () => {
  test('applies `changes` to open file, in one undo step', async () => {
    const { view, stub } = await open();

    const response = await applyEdit(stub, { changes: { [URI]: [edit(0, 6, 11, 'sum'), edit(1, 6, 11, 'rest')] } });

    expect(response.result).toEqual({ applied: true });
    expect(view.state.doc.toString()).toBe('const sum = 1;\nconst rest = 2;');
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('applies text edits in `documentChanges`', async () => {
    const { instance, view, stub } = await open();
    const version = instance.client.workspace.getFile(URI)?.version ?? null;

    const response = await applyEdit(stub, {
      documentChanges: [{ textDocument: { uri: URI, version }, edits: [edit(0, 6, 11, 'sum')] }],
    });

    expect(response.result).toEqual({ applied: true });
    expect(view.state.doc.toString()).toBe('const sum = 1;\nconst other = 2;');
  });

  test("refuses edits to version that isn't open file's", async () => {
    const { instance, view, stub } = await open();
    const version = (instance.client.workspace.getFile(URI)?.version ?? 0) + 1;

    const response = await applyEdit(stub, {
      documentChanges: [{ textDocument: { uri: URI, version }, edits: [edit(0, 6, 11, 'sum')] }],
    });

    expect(response.result).toMatchObject({ applied: false, failureReason: expect.any(String) });
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('refuses to create, rename or delete files, applying none', async () => {
    const { view, stub } = await open();

    for (const operation of [
      { kind: 'create', uri: CLOSED },
      { kind: 'rename', oldUri: CLOSED, newUri: `${CLOSED}x` },
      { kind: 'delete', uri: CLOSED },
    ] as const) {
      const response = await applyEdit(stub, {
        documentChanges: [{ textDocument: { uri: URI, version: null }, edits: [edit(0, 6, 11, 'sum')] }, operation],
      });

      expect(response.result).toMatchObject({ applied: false, failureReason: expect.any(String) });
      expect(view.state.doc.toString()).toBe(DOC);
    }
  });

  test('refuses edits to unopened file, applying none', async () => {
    const { view, stub } = await open();

    const response = await applyEdit(stub, {
      changes: { [URI]: [edit(0, 6, 11, 'sum')], [CLOSED]: [edit(0, 0, 0, 'x')] },
    });

    expect(response.result).toMatchObject({ applied: false, failureReason: expect.any(String) });
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('clamps positions past line end', async () => {
    const { view, stub } = await open();

    const response = await applyEdit(stub, { changes: { [URI]: [edit(0, 99, 99, ' // total')] } });

    expect(response.result).toEqual({ applied: true });
    expect(view.state.doc.toString()).toBe('const total = 1; // total\nconst other = 2;');
  });

  test("maps edits through typing since server's last version", async () => {
    const { view, stub } = await open();
    view.dispatch({ changes: { from: 0, insert: 'export ' } });

    const response = await applyEdit(stub, { changes: { [URI]: [edit(0, 6, 11, 'sum')] } });

    expect(response.result).toEqual({ applied: true });
    expect(view.state.doc.toString()).toBe('export const sum = 1;\nconst other = 2;');
  });
});
