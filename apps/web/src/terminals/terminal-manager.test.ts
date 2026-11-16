import { create } from '@bufbuild/protobuf';
import type { ContextMenuGroup, TerminalView, WorkspaceId } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { type Daemon, daemonQuery } from '@/daemon';
import {
  CreateTerminalResponseSchema,
  DeleteTerminalResponseSchema,
  GetTerminalsResponseSchema,
  UpdateTerminalResponseSchema,
} from '@/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { DEFAULT_CONTEXT_MENU } from '@/terminals/context-menu/default-context-menu';
import { TerminalManager } from '@/terminals/terminal-manager';

const SINGAPORE: WorkspaceId = { daemon: 'local', project: 'elsewise', workspace: 'singapore' };
const TOKYO = { ...SINGAPORE, session: 'tokyo-1' };
const OSAKA = { ...SINGAPORE, session: 'osaka-1' };

// A manager over a daemon that has tokyo-1 in Singapore, lists it once `listed` resolves, and deletes it with
// `deleteTerminal`.
function setUp(
  listed: Promise<void> = Promise.resolve(),
  deleteTerminal: () => Promise<unknown> = async () => create(DeleteTerminalResponseSchema),
) {
  const terminal = { workspaceId: 'singapore', id: 'tokyo-1', name: 'Terminal' };
  const client = new QueryClient();
  client.setQueryData(daemonQuery('local').queryKey, {
    terminals: {
      createTerminal: async () => create(CreateTerminalResponseSchema, { terminal }),
      getTerminals: async () => {
        await listed;
        return create(GetTerminalsResponseSchema, { terminals: [terminal] });
      },
      updateTerminal: async ({ name }: { name: string }) =>
        create(UpdateTerminalResponseSchema, { terminal: { ...terminal, name } }),
      deleteTerminal,
    },
  } as unknown as Daemon);
  return new TerminalManager(client);
}

// Adds tokyo-1 to Singapore and opens it.
async function open(terminals: TerminalManager): Promise<TerminalView> {
  await terminals.store.add(SINGAPORE);
  const view = await terminals.open(TOKYO);
  if (view === null) {
    throw new Error('tokyo-1 is not open');
  }
  return view;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('active', () => {
  test('returns focused terminal', async () => {
    const terminals = setUp();
    const view = await open(terminals);

    terminals.activate(view.session.id);

    expect(terminals.active).toEqual(view);
  });

  test('ignores terminal that is not open', () => {
    const terminals = setUp();

    terminals.activate(OSAKA);

    expect(terminals.active).toBeNull();
  });
});

describe('activate', () => {
  test('ignores active terminal', () => {
    const terminals = setUp();
    const listener = vi.fn();
    terminals.subscribe(listener);
    terminals.activate(TOKYO);
    terminals.activate({ ...TOKYO });

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('deactivate', () => {
  test('clears and notifies for active terminal', async () => {
    const terminals = setUp();
    const view = await open(terminals);
    const listener = vi.fn();
    terminals.activate(view.session.id);
    terminals.subscribe(listener);
    terminals.deactivate(view.session.id);

    expect(terminals.active).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });

  test('ignores another terminal', async () => {
    const terminals = setUp();
    const view = await open(terminals);
    const listener = vi.fn();
    terminals.activate(view.session.id);
    terminals.subscribe(listener);
    terminals.deactivate(OSAKA);

    expect(terminals.active).toEqual(view);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('get', () => {
  test('returns open terminal or null', async () => {
    const terminals = setUp();
    await terminals.store.add(SINGAPORE);

    expect(terminals.get(TOKYO)).toBeNull();

    await terminals.open(TOKYO);

    expect(terminals.get(TOKYO)?.session.name).toBe('Terminal');
    expect(terminals.list()).toEqual([terminals.get(TOKYO)]);
  });
});

describe('open', () => {
  test('returns same xterm', async () => {
    const terminals = setUp();
    await terminals.store.add(SINGAPORE);

    const first = await terminals.open(TOKYO);

    expect((await terminals.open(TOKYO))?.terminal).toBe(first?.terminal);
  });

  test('opens once for concurrent calls', async () => {
    const terminals = setUp();
    const onOpen = vi.fn<(view: TerminalView) => void>();
    terminals.onOpen(onOpen);

    const [first, second] = await Promise.all([terminals.open(TOKYO), terminals.open(TOKYO)]);

    expect(second?.terminal).toBe(first?.terminal);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  test('opens nothing for terminal deleted while opening', async () => {
    const { promise: listed, resolve: list } = Promise.withResolvers<void>();
    const terminals = setUp(listed);
    const onOpen = vi.fn<(view: TerminalView) => void>();
    terminals.onOpen(onOpen);

    const opening = terminals.open(TOKYO);
    await terminals.delete(TOKYO);
    list();

    expect(await opening).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
    expect(terminals.list()).toEqual([]);
    expect(terminals.store.sessions.get(TOKYO)).toBeUndefined();
  });

  test('gets session of restored terminal', async () => {
    const terminals = setUp();
    const onOpen = vi.fn<(view: TerminalView) => void>();
    terminals.onOpen(onOpen);

    const view = await terminals.open(TOKYO);

    expect(view?.session.name).toBe('Terminal');
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(view);
  });
});

describe('onOpen', () => {
  test('tells opened and closed terminals', async () => {
    const terminals = setUp();
    const onOpen = vi.fn<(view: TerminalView) => void>();
    const onClose = vi.fn<(view: TerminalView) => void>();
    terminals.onOpen(onOpen);
    terminals.onClose(onClose);

    const view = await open(terminals);
    await terminals.delete(TOKYO);

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(view);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(view);
    expect(terminals.list()).toEqual([]);
  });

  test('stops telling once disposed', async () => {
    const terminals = setUp();
    const onOpen = vi.fn();
    terminals.onOpen(onOpen)();

    await open(terminals);

    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('rename', () => {
  test('tells renamed terminal', async () => {
    const terminals = setUp();
    await open(terminals);
    const onChange = vi.fn<(view: TerminalView) => void>();
    terminals.onChange(onChange);

    await terminals.rename(TOKYO, 'Build');

    expect(terminals.get(TOKYO)?.session.name).toBe('Build');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(terminals.get(TOKYO));
  });
});

describe('delete', () => {
  test('keeps terminal the daemon failed to delete', async () => {
    const terminals = setUp(undefined, async () => {
      throw new Error('the daemon is busy');
    });
    const view = await open(terminals);
    const onClose = vi.fn();
    terminals.onClose(onClose);

    await expect(terminals.delete(TOKYO)).rejects.toThrow('the daemon is busy');
    expect(terminals.list()).toEqual([view]);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('addContextMenu', () => {
  test('adds groups until disposed', () => {
    const terminals = setUp();
    const added: ContextMenuGroup[] = [{ id: 'reactions', order: 50, items: [{ order: 10, command: 'shrug' }] }];
    const dispose = terminals.addContextMenu(added);

    expect(terminals.contextMenu).toEqual([...DEFAULT_CONTEXT_MENU, ...added]);

    dispose();

    expect(terminals.contextMenu).toEqual(DEFAULT_CONTEXT_MENU);
  });

  test('notifies on change', () => {
    const terminals = setUp();
    const listener = vi.fn();
    terminals.subscribe(listener);

    terminals.addContextMenu([{ id: 'reactions', items: [] }])();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('subscribe', () => {
  test('continues past throwing listener', () => {
    const terminals = setUp();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    terminals.subscribe(() => {
      throw new Error('boom');
    });
    terminals.subscribe(listener);

    terminals.activate(TOKYO);

    expect(listener).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  test('stops notifying once disposed', () => {
    const terminals = setUp();
    const listener = vi.fn();
    terminals.subscribe(listener)();

    terminals.activate(TOKYO);

    expect(listener).not.toHaveBeenCalled();
  });
});
