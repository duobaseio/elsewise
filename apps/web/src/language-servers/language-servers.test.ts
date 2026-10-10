import { toast } from '@elsewise/components/components/toast';
import type { LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { EditorAdditions } from '@/plugins/editor';
import { type StubTransport, stubTransport } from '../../test/stub-transport';
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
  test('closes the connections of servers that are removed', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fake = stubTransport();
    const remove = additions.addLanguageServers([server(() => fake)]);
    servers.connect(ROOT, 'Toy', URI);
    await started();
    remove();

    expect(fake.closed).toBe(true);
  });

  test('closes a connection that opens after its server was removed', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fake = stubTransport();
    let open: (transport: LanguageServerTransport) => void = () => {};
    const remove = additions.addLanguageServers([server(() => new Promise((resolve) => (open = resolve)))]);
    servers.connect(ROOT, 'Toy', URI);
    remove();
    open(fake);
    await started();

    expect(fake.closed).toBe(true);
    expect(fake.sent).toEqual([]);
  });
});

describe('find', () => {
  test('returns the most recently added server that serves the language', () => {
    const additions = new EditorAdditions();
    const earlier = server(() => stubTransport());
    const later = server(() => stubTransport());
    additions.addLanguageServers([earlier]);
    additions.addLanguageServers([later, server(() => stubTransport(), { languages: { Other: 'other' } })]);

    expect(new LanguageServers(additions).find('Toy')).toBe(later);
  });

  test('returns nothing when no server serves the language', () => {
    const additions = new EditorAdditions();
    additions.addLanguageServers([server(() => stubTransport())]);

    expect(new LanguageServers(additions).find('Other')).toBeUndefined();
  });
});

describe('subscribe', () => {
  test('calls the listener when a server is added or removed, until disposed', () => {
    const additions = new EditorAdditions();
    const listener = vi.fn();
    const unsubscribe = new LanguageServers(additions).subscribe(listener);
    const remove = additions.addLanguageServers([server(() => stubTransport())]);
    remove();

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    additions.addLanguageServers([server(() => stubTransport())]);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('connect', () => {
  test('returns nothing when no server serves the language', async () => {
    const additions = new EditorAdditions();
    const start = vi.fn(() => stubTransport());
    additions.addLanguageServers([server(start)]);

    expect(new LanguageServers(additions).connect(ROOT, 'Other', URI)).toBeUndefined();

    await started();

    expect(start).not.toHaveBeenCalled();
  });

  test('starts the most recently added server that serves the language', async () => {
    const additions = new EditorAdditions();
    const earlier = vi.fn(() => stubTransport());
    const later = vi.fn(() => stubTransport());
    additions.addLanguageServers([server(earlier)]);
    additions.addLanguageServers([server(later)]);

    expect(new LanguageServers(additions).connect(ROOT, 'Toy', URI)).toBeDefined();

    await started();

    expect(earlier).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
  });

  test('starts the server with the root', async () => {
    const additions = new EditorAdditions();
    const start = vi.fn(() => stubTransport());
    additions.addLanguageServers([server(start)]);
    new LanguageServers(additions).connect(ROOT, 'Toy', URI);
    await started();

    expect(start).toHaveBeenCalledWith(ROOT);
  });

  test('initializes the server with the root as servers write it', async () => {
    const additions = new EditorAdditions();
    const fake = stubTransport();
    additions.addLanguageServers([server(() => fake)]);
    new LanguageServers(additions).connect(new URL('file:///$worktree/'), 'Toy', URI);
    await started();

    expect(fake.sent).toMatchObject([
      { method: 'initialize', params: { rootUri: 'file:///%24worktree/' } },
      { method: 'initialized' },
    ]);
  });

  test('initializes the server with the root and its options', async () => {
    const additions = new EditorAdditions();
    const fake = stubTransport();
    additions.addLanguageServers([server(() => fake, { initializationOptions: { strict: true } })]);
    new LanguageServers(additions).connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent).toMatchObject([
      { method: 'initialize', params: { rootUri: ROOT.href, initializationOptions: { strict: true } } },
      { method: 'initialized' },
    ]);
  });

  test('starts a server once for the same root', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const start = vi.fn(() => stubTransport());
    additions.addLanguageServers([server(start)]);
    servers.connect(ROOT, 'Toy', URI);
    servers.connect(ROOT, 'Toy', new URL('file:///worktree/other.toy'));
    await started();
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(start).toHaveBeenCalledTimes(1);
  });

  test('starts a server for each root', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fakes: StubTransport[] = [];
    additions.addLanguageServers([server(() => fakes[fakes.push(stubTransport()) - 1])]);
    servers.connect(new URL('file:///first'), 'Toy', new URL('file:///first/main.toy'));
    servers.connect(new URL('file:///second'), 'Toy', new URL('file:///second/main.toy'));
    await started();

    expect(fakes.map((fake) => fake.sent[0])).toMatchObject([
      { method: 'initialize', params: { rootUri: 'file:///first' } },
      { method: 'initialize', params: { rootUri: 'file:///second' } },
    ]);
  });

  test('restarts a server whose connection closed, and says it stopped', async () => {
    const add = vi.spyOn(toast, 'add');
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fakes: StubTransport[] = [];
    additions.addLanguageServers([server(() => fakes[fakes.push(stubTransport()) - 1])]);
    servers.connect(ROOT, 'Toy', URI);
    await started();
    fakes[0].crash();
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(add).toHaveBeenCalledWith({ type: 'warning', title: 'Toy stopped' });
    expect(fakes).toHaveLength(2);
    expect(fakes[1].sent[0]).toMatchObject({ method: 'initialize' });
  });

  test('restarts a server that failed to start, and says it failed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const add = vi.spyOn(toast, 'add');
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fake = stubTransport();
    const failure = new Error('No such server');
    additions.addLanguageServers([server(vi.fn(() => fake).mockRejectedValueOnce(failure))]);
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(error).toHaveBeenCalledWith('Language server Toy failed to start', failure);
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

  test('keeps what is encoded already', () => {
    expect(serverUri(new URL('file:///w/%24project/'))).toBe('file:///w/%24project/');
  });

  test('lowercases a Windows drive letter, and encodes its colon', () => {
    expect(serverUri(new URL('file:///C:/Users/main.ts'))).toBe('file:///c%3A/Users/main.ts');
  });
});

describe('dispose', () => {
  test('closes every connection', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fakes: StubTransport[] = [];
    additions.addLanguageServers([server(() => fakes[fakes.push(stubTransport()) - 1])]);
    servers.connect(new URL('file:///first'), 'Toy', new URL('file:///first/main.toy'));
    servers.connect(new URL('file:///second'), 'Toy', new URL('file:///second/main.toy'));
    await started();
    servers.dispose();

    expect(fakes.map((fake) => fake.closed)).toEqual([true, true]);
  });
});

describe('LanguageServerInstance.start', () => {
  test('does nothing when the server was stopped', async () => {
    const start = vi.fn(() => stubTransport());
    const instance = new LanguageServerInstance(server(start), ROOT);
    instance.stop();
    await instance.start();

    expect(start).not.toHaveBeenCalled();
  });

  test("shows the server's messages, but not its logs", async () => {
    const add = vi.spyOn(toast, 'add');
    const fake = stubTransport();
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

  test("doesn't say a server that was stopped stopped", async () => {
    const add = vi.spyOn(toast, 'add');
    const fake = stubTransport();
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
