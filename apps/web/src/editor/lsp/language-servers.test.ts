import { EditorState, Facet } from '@codemirror/state';
import { toast } from '@elsewise/components/components/toast';
import type { LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { EditorManager } from '@/editor/editor-manager';
import { StubTransport } from '../../../test/stub-transport';
import { LanguageServerInstance, LanguageServers, serverUri } from './language-servers';

const ROOT = new URL('file:///worktree');
const URI = new URL('file:///worktree/main.toy');

// Returns a language server for the `Toy` language that `start` starts.
function server(start: LanguageServer['start'], overrides: Partial<LanguageServer> = {}): LanguageServer {
  return { id: 'toy', name: 'Toy', languages: { Toy: 'toy' }, start, ...overrides };
}

// Waits for the servers that are starting to finish.
function started(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('constructor', () => {
  test('closes connections of removed servers', async () => {
    const editor = new EditorManager();
    const servers = new LanguageServers(editor);
    const fake = new StubTransport();
    const remove = editor.languages.addServers([server(() => fake)]);
    servers.connect(ROOT, 'Toy', URI);
    await started();
    remove();

    expect(fake.closed).toBe(true);
  });

  test('closes connection opened after removal', async () => {
    const editor = new EditorManager();
    const servers = new LanguageServers(editor);
    const fake = new StubTransport();
    let open: (transport: LanguageServerTransport) => void = () => {};
    const remove = editor.languages.addServers([server(() => new Promise((resolve) => (open = resolve)))]);
    servers.connect(ROOT, 'Toy', URI);
    remove();
    open(fake);
    await started();

    expect(fake.closed).toBe(true);
    expect(fake.sent).toEqual([]);
  });
});

describe('find', () => {
  test('returns latest server for language', () => {
    const editor = new EditorManager();
    const earlier = server(() => new StubTransport());
    const later = server(() => new StubTransport());
    editor.languages.addServers([earlier]);
    editor.languages.addServers([later, server(() => new StubTransport(), { languages: { Other: 'other' } })]);

    expect(new LanguageServers(editor).find('Toy')).toBe(later);
  });

  test('returns nothing without server for language', () => {
    const editor = new EditorManager();
    editor.languages.addServers([server(() => new StubTransport())]);

    expect(new LanguageServers(editor).find('Other')).toBeUndefined();
  });
});

describe('subscribe', () => {
  test('notifies on add and remove until disposed', () => {
    const editor = new EditorManager();
    const listener = vi.fn();
    const unsubscribe = new LanguageServers(editor).subscribe(listener);
    const remove = editor.languages.addServers([server(() => new StubTransport())]);
    remove();

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    editor.languages.addServers([server(() => new StubTransport())]);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('connect', () => {
  test('returns nothing without server for language', async () => {
    const editor = new EditorManager();
    const start = vi.fn(() => new StubTransport());
    editor.languages.addServers([server(start)]);

    expect(new LanguageServers(editor).connect(ROOT, 'Other', URI)).toBeUndefined();

    await started();

    expect(start).not.toHaveBeenCalled();
  });

  test('starts latest server for language', async () => {
    const editor = new EditorManager();
    const earlier = vi.fn(() => new StubTransport());
    const later = vi.fn(() => new StubTransport());
    editor.languages.addServers([server(earlier)]);
    editor.languages.addServers([server(later)]);

    expect(new LanguageServers(editor).connect(ROOT, 'Toy', URI)).toBeDefined();

    await started();

    expect(earlier).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
  });

  test('initializes server with root as servers write it', async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([server(() => fake)]);
    new LanguageServers(editor).connect(new URL('file:///$worktree/'), 'Toy', URI);
    await started();

    expect(fake.sent).toMatchObject([
      { method: 'initialize', params: { rootUri: 'file:///%24worktree/' } },
      { method: 'initialized' },
    ]);
  });

  test('initializes server with root and options', async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([server(() => fake, { initializationOptions: { strict: true } })]);
    new LanguageServers(editor).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent).toMatchObject([
      { method: 'initialize', params: { rootUri: ROOT.href, initializationOptions: { strict: true } } },
      { method: 'initialized' },
    ]);
  });

  test('tells server it can apply edits', async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([server(() => fake)]);
    new LanguageServers(editor).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent[0]).toMatchObject({
      method: 'initialize',
      params: { capabilities: { workspace: { applyEdit: true, workspaceEdit: { documentChanges: true } } } },
    });
  });

  test('tells server it can ask to refresh diagnostics', async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([server(() => fake)]);
    new LanguageServers(editor).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent[0]).toMatchObject({
      method: 'initialize',
      params: { capabilities: { workspace: { diagnostics: { refreshSupport: true } } } },
    });
  });

  test('tells server it can ask for settings when handled', async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([server(() => fake, { requestHandlers: { 'workspace/configuration': () => [] } })]);
    new LanguageServers(editor).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent[0]).toMatchObject({
      method: 'initialize',
      params: { capabilities: { workspace: { configuration: true } } },
    });
  });

  test("doesn't tell server it can ask for settings when unhandled", async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([server(() => fake)]);
    new LanguageServers(editor).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent[0]).toMatchObject({ method: 'initialize' });
    expect(fake.sent[0]).not.toMatchObject({ params: { capabilities: { workspace: { configuration: true } } } });
  });

  test('calls connect after initialized', async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([
      server(() => fake, {
        connect: (client) => client.notification('workspace/didChangeConfiguration', { settings: { toy: true } }),
      }),
    ]);
    new LanguageServers(editor).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent).toMatchObject([
      { method: 'initialize' },
      { method: 'initialized' },
      { method: 'workspace/didChangeConfiguration', params: { settings: { toy: true } } },
    ]);
  });

  test('sends client capabilities of extensions under core', async () => {
    const editor = new EditorManager();
    const fake = new StubTransport();
    editor.languages.addServers([
      server(() => fake, {
        extensions: [
          { clientCapabilities: { textDocument: { rename: { prepareSupport: false } }, experimental: { toy: 1 } } },
        ],
      }),
    ]);
    new LanguageServers(editor).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent[0]).toMatchObject({
      method: 'initialize',
      params: { capabilities: { textDocument: { rename: { prepareSupport: true } }, experimental: { toy: 1 } } },
    });
  });

  test('adds extensions to documents', () => {
    const editor = new EditorManager();
    const toy = Facet.define<number>();
    editor.languages.addServers([
      server(() => new StubTransport(), { extensions: [toy.of(1), { editorExtension: toy.of(2) }] }),
    ]);
    const state = EditorState.create({ extensions: new LanguageServers(editor).connect(ROOT, 'Toy', URI) });

    expect(state.facet(toy)).toEqual([1, 2]);
  });

  test('starts server once per root', async () => {
    const editor = new EditorManager();
    const servers = new LanguageServers(editor);
    const start = vi.fn(() => new StubTransport());
    editor.languages.addServers([server(start)]);
    servers.connect(ROOT, 'Toy', URI);
    servers.connect(ROOT, 'Toy', new URL('file:///worktree/other.toy'));
    await started();
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(start).toHaveBeenCalledTimes(1);
  });

  test('starts server for each root', async () => {
    const editor = new EditorManager();
    const servers = new LanguageServers(editor);
    const fakes: StubTransport[] = [];
    editor.languages.addServers([server(() => fakes[fakes.push(new StubTransport()) - 1])]);
    servers.connect(new URL('file:///first'), 'Toy', new URL('file:///first/main.toy'));
    servers.connect(new URL('file:///second'), 'Toy', new URL('file:///second/main.toy'));
    await started();

    expect(fakes.map((fake) => fake.sent[0])).toMatchObject([
      { method: 'initialize', params: { rootUri: 'file:///first' } },
      { method: 'initialize', params: { rootUri: 'file:///second' } },
    ]);
  });

  test('restarts server whose connection closed, and says it stopped', async () => {
    const add = vi.spyOn(toast, 'add');
    const editor = new EditorManager();
    const servers = new LanguageServers(editor);
    const fakes: StubTransport[] = [];
    editor.languages.addServers([server(() => fakes[fakes.push(new StubTransport()) - 1])]);
    servers.connect(ROOT, 'Toy', URI);
    await started();
    fakes[0].crash();
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(add).toHaveBeenCalledWith({ type: 'warning', title: 'Toy stopped' });
    expect(fakes).toHaveLength(2);
    expect(fakes[1].sent[0]).toMatchObject({ method: 'initialize' });
  });

  test('restarts server that failed to start, and says it failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const add = vi.spyOn(toast, 'add');
    const editor = new EditorManager();
    const servers = new LanguageServers(editor);
    const fake = new StubTransport();
    const failure = new Error('No such server');
    editor.languages.addServers([server(vi.fn(() => fake).mockRejectedValueOnce(failure))]);
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(add).toHaveBeenCalledWith({ type: 'error', title: 'Toy failed to start', description: 'No such server' });
    expect(fake.sent).toEqual([]);

    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent[0]).toMatchObject({ method: 'initialize' });
  });
});

describe('serverUri', () => {
  test('percent-encodes every character but letters, digits, `-._~` and `/`', () => {
    expect(serverUri(new URL("file:///w/$project/a b+c!'()*@/ü-._~.ts"))).toBe(
      'file:///w/%24project/a%20b%2Bc%21%27%28%29%2A%40/%C3%BC-._~.ts',
    );
  });

  test('keeps existing encoding', () => {
    expect(serverUri(new URL('file:///w/%24project/'))).toBe('file:///w/%24project/');
  });

  test('lowercases Windows drive letter, and encodes colon', () => {
    expect(serverUri(new URL('file:///C:/Users/main.ts'))).toBe('file:///c%3A/Users/main.ts');
  });
});

describe('dispose', () => {
  test('closes every connection', async () => {
    const editor = new EditorManager();
    const servers = new LanguageServers(editor);
    const fakes: StubTransport[] = [];
    editor.languages.addServers([server(() => fakes[fakes.push(new StubTransport()) - 1])]);
    servers.connect(new URL('file:///first'), 'Toy', new URL('file:///first/main.toy'));
    servers.connect(new URL('file:///second'), 'Toy', new URL('file:///second/main.toy'));
    await started();
    servers.dispose();

    expect(fakes.map((fake) => fake.closed)).toEqual([true, true]);
  });
});

describe('LanguageServerInstance.start', () => {
  test('ignores stopped server', async () => {
    const start = vi.fn(() => new StubTransport());
    const instance = new LanguageServerInstance(server(start), ROOT);
    instance.stop();
    await instance.start();

    expect(start).not.toHaveBeenCalled();
  });

  test("shows server's messages, but not logs", async () => {
    const add = vi.spyOn(toast, 'add');
    const fake = new StubTransport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    await instance.start();
    for (const [type, message] of [
      [1, 'Crashed'],
      [2, 'Slow'],
      [3, 'Ready'],
      [4, 'Logged'],
    ]) {
      fake.notify('window/showMessage', { type, message });
    }

    expect(add.mock.calls).toEqual([
      [{ type: 'error', title: 'Toy', description: 'Crashed' }],
      [{ type: 'warning', title: 'Toy', description: 'Slow' }],
      [{ type: 'info', title: 'Toy', description: 'Ready' }],
    ]);
  });

  test('hands notifications to extensions ahead of core', async () => {
    const add = vi.spyOn(toast, 'add');
    const status = vi.fn(() => true);
    const message = vi.fn(() => true);
    const fake = new StubTransport();
    const instance = new LanguageServerInstance(
      server(() => fake, {
        extensions: [{ notificationHandlers: { 'toy/status': status, 'window/showMessage': message } }],
      }),
      ROOT,
    );
    await instance.start();
    fake.notify('toy/status', { busy: true });
    fake.notify('window/showMessage', { type: 3, message: 'Ready' });

    expect(status).toHaveBeenCalledWith(instance.client, { busy: true });
    expect(message).toHaveBeenCalledWith(instance.client, { type: 3, message: 'Ready' });
    expect(add).not.toHaveBeenCalled();
  });

  test('answers requests with request handlers', async () => {
    const fake = new StubTransport();
    const instance = new LanguageServerInstance(
      server(() => fake, {
        requestHandlers: {
          'toy/increment': (_, { n }: { n: number }) => n + 1,
          'toy/decrement': async (_, { n }: { n: number }) => n - 1,
          'toy/ignore': () => {},
        },
      }),
      ROOT,
    );
    await instance.start();

    expect(await fake.request('toy/increment', { n: 1 })).toEqual({ result: 2 });
    expect(await fake.request('toy/decrement', { n: 1 })).toEqual({ result: 0 });
    expect(await fake.request('toy/ignore', {})).toEqual({ result: null });
  });

  test('answers requests with error when handler fails', async () => {
    const fake = new StubTransport();
    const instance = new LanguageServerInstance(
      server(() => fake, {
        requestHandlers: {
          'toy/throw': () => {
            throw new Error('Thrown');
          },
          'toy/reject': () => Promise.reject(new Error('Rejected')),
        },
      }),
      ROOT,
    );
    await instance.start();

    expect(await fake.request('toy/throw', {})).toEqual({ error: { code: -32603, message: 'Thrown' } });
    expect(await fake.request('toy/reject', {})).toEqual({ error: { code: -32603, message: 'Rejected' } });
  });

  test('answers requests with request handlers ahead of core', async () => {
    const fake = new StubTransport();
    const instance = new LanguageServerInstance(
      server(() => fake, { requestHandlers: { 'workspace/applyEdit': () => ({ applied: false }) } }),
      ROOT,
    );
    await instance.start();

    expect(await fake.request('workspace/applyEdit', { edit: {} })).toEqual({ result: { applied: false } });
  });

  test("doesn't say server that was stopped stopped", async () => {
    const add = vi.spyOn(toast, 'add');
    const fake = new StubTransport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    await instance.start();
    instance.stop();

    expect(fake.closed).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });
});
