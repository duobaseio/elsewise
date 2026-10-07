import type { LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { EditorAdditions } from '@/plugins/editor';
import { LanguageServerInstance, LanguageServers } from './language-servers';

const ROOT = new URL('file:///worktree');
const URI = new URL('file:///worktree/main.toy');

interface FakeTransport extends LanguageServerTransport {
  /** The messages sent to the server. */
  readonly sent: { method?: string; params?: unknown }[];
  /** Whether the connection was closed from this side. */
  closed: boolean;
  /** Closes the connection as a server that crashed would. */
  crash(): void;
}

// Returns a transport to a server that only answers the `initialize` request.
function transport(): FakeTransport {
  const messageListeners = new Set<(message: string) => void>();
  const closeListeners = new Set<() => void>();
  const fake: FakeTransport = {
    sent: [],
    closed: false,
    send(message) {
      const parsed = JSON.parse(message);
      fake.sent.push(parsed);
      if (parsed.method === 'initialize') {
        for (const listener of messageListeners) {
          listener(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { capabilities: {} } }));
        }
      }
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    close() {
      fake.closed = true;
      fake.crash();
    },
    crash() {
      for (const listener of closeListeners) {
        listener();
      }
    },
  };
  return fake;
}

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
    const fake = transport();
    const remove = additions.addLanguageServers([server(() => fake)]);
    servers.connect(ROOT, 'Toy', URI);
    await started();
    remove();

    expect(fake.closed).toBe(true);
  });

  test('closes a connection that opens after its server was removed', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fake = transport();
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
    const earlier = server(transport);
    const later = server(transport);
    additions.addLanguageServers([earlier]);
    additions.addLanguageServers([later, server(transport, { languages: { Other: 'other' } })]);

    expect(new LanguageServers(additions).find('Toy')).toBe(later);
  });

  test('returns nothing when no server serves the language', () => {
    const additions = new EditorAdditions();
    additions.addLanguageServers([server(transport)]);

    expect(new LanguageServers(additions).find('Other')).toBeUndefined();
  });
});

describe('subscribe', () => {
  test('calls the listener when a server is added or removed, until disposed', () => {
    const additions = new EditorAdditions();
    const listener = vi.fn();
    const unsubscribe = new LanguageServers(additions).subscribe(listener);
    const remove = additions.addLanguageServers([server(transport)]);
    remove();

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    additions.addLanguageServers([server(transport)]);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('connect', () => {
  test('returns nothing when no server serves the language', async () => {
    const additions = new EditorAdditions();
    const start = vi.fn(transport);
    additions.addLanguageServers([server(start)]);

    expect(new LanguageServers(additions).connect(ROOT, 'Other', URI)).toBeUndefined();

    await started();

    expect(start).not.toHaveBeenCalled();
  });

  test('starts the most recently added server that serves the language', async () => {
    const additions = new EditorAdditions();
    const earlier = vi.fn(transport);
    const later = vi.fn(transport);
    additions.addLanguageServers([server(earlier)]);
    additions.addLanguageServers([server(later)]);

    expect(new LanguageServers(additions).connect(ROOT, 'Toy', URI)).toBeDefined();

    await started();

    expect(earlier).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
  });

  test('starts the server with the root', async () => {
    const additions = new EditorAdditions();
    const start = vi.fn(transport);
    additions.addLanguageServers([server(start)]);
    new LanguageServers(additions).connect(ROOT, 'Toy', URI);
    await started();

    expect(start).toHaveBeenCalledWith(ROOT);
  });

  test('initializes the server with the root and its options', async () => {
    const additions = new EditorAdditions();
    const fake = transport();
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
    const start = vi.fn(transport);
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
    const fakes: FakeTransport[] = [];
    additions.addLanguageServers([server(() => fakes[fakes.push(transport()) - 1])]);
    servers.connect(new URL('file:///first'), 'Toy', new URL('file:///first/main.toy'));
    servers.connect(new URL('file:///second'), 'Toy', new URL('file:///second/main.toy'));
    await started();

    expect(fakes.map((fake) => fake.sent[0])).toMatchObject([
      { method: 'initialize', params: { rootUri: 'file:///first' } },
      { method: 'initialize', params: { rootUri: 'file:///second' } },
    ]);
  });

  test('restarts a server whose connection closed', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fakes: FakeTransport[] = [];
    additions.addLanguageServers([server(() => fakes[fakes.push(transport()) - 1])]);
    servers.connect(ROOT, 'Toy', URI);
    await started();
    fakes[0].crash();
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(fakes).toHaveLength(2);
    expect(fakes[1].sent[0]).toMatchObject({ method: 'initialize' });
  });

  test('restarts a server that failed to start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fake = transport();
    const failure = new Error('No such server');
    additions.addLanguageServers([server(vi.fn(() => fake).mockRejectedValueOnce(failure))]);
    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(error).toHaveBeenCalledWith('Language server Toy failed to start', failure);
    expect(fake.sent).toEqual([]);

    servers.connect(ROOT, 'Toy', URI);
    await started();

    expect(fake.sent[0]).toMatchObject({ method: 'initialize' });
  });
});

describe('dispose', () => {
  test('closes every connection', async () => {
    const additions = new EditorAdditions();
    const servers = new LanguageServers(additions);
    const fakes: FakeTransport[] = [];
    additions.addLanguageServers([server(() => fakes[fakes.push(transport()) - 1])]);
    servers.connect(new URL('file:///first'), 'Toy', new URL('file:///first/main.toy'));
    servers.connect(new URL('file:///second'), 'Toy', new URL('file:///second/main.toy'));
    await started();
    servers.dispose();

    expect(fakes.map((fake) => fake.closed)).toEqual([true, true]);
  });
});

describe('LanguageServerInstance.start', () => {
  test('does nothing when the server was stopped', async () => {
    const start = vi.fn(transport);
    const instance = new LanguageServerInstance(server(start), ROOT);
    instance.stop();
    await instance.start();

    expect(start).not.toHaveBeenCalled();
  });
});
