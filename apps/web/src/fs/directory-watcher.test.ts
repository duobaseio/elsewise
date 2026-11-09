import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { describe, expect, test } from 'vitest';
import {
  DirectoryListing_Entry_Type,
  type WatchDirectoriesRequestSchema,
  type WatchDirectoriesResponse,
  WatchDirectoriesResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { DirectoryWatcher, type DirectoryWatcherModel, type DirectoryWatcherSnapshot } from './directory-watcher';

// A model that keeps its paths in a set, and a stream that sends what `respond` is given.
function fake(restored: DirectoryWatcherSnapshot = { expanded: [], selected: [] }) {
  const paths = new Set<string>(['stale.ts']);
  const selected = new Set<string>();
  const expanded = new Set<string>();
  const snapshots: DirectoryWatcherSnapshot[] = [];
  let created: DirectoryWatcher | undefined;
  let expansion: ((path: string, expanded: boolean) => void) | undefined;
  const model = {
    batch: (operations) => {
      for (const operation of operations) {
        if (operation.type === 'add') {
          paths.add(operation.path);
        } else if (operation.type === 'remove') {
          for (const path of [...paths].filter((path) => path.startsWith(operation.path))) {
            paths.delete(path);
          }
        }
      }
    },
    resetPaths: (
      next: readonly string[] | { preparedInput: unknown },
      options?: { initialExpandedPaths?: readonly string[] },
    ) => {
      paths.clear();
      for (const path of 'preparedInput' in next ? [] : next) {
        paths.add(path);
      }
      expanded.clear();
      for (const path of options?.initialExpandedPaths ?? []) {
        expanded.add(path);
      }
      if (created !== undefined) {
        snapshots.push(created.snapshot());
      }
    },
    getItem: (path: string) => {
      if (!paths.has(path)) {
        return null;
      }

      const item = {
        deselect: () => {
          selected.delete(path);
        },
        focus: () => {},
        getPath: () => path,
        isFocused: () => false,
        isSelected: () => selected.has(path),
        select: () => {
          selected.add(path);
        },
        toggleSelect: () => {},
      };
      return path.endsWith('/')
        ? {
            ...item,
            collapse: () => expansion?.(path, false),
            expand: () => expansion?.(path, true),
            isDirectory: () => true as const,
            isExpanded: () => false,
            toggle: () => {},
          }
        : { ...item, isDirectory: () => false as const };
    },
    getSelectedPaths: () => [...selected],
    onExpansion: (listener) => {
      expansion = listener;
      return () => {
        expansion = undefined;
      };
    },
  } satisfies DirectoryWatcherModel;

  const sent: MessageInitShape<typeof WatchDirectoriesRequestSchema>[] = [];
  const pending: WatchDirectoriesResponse[] = [];
  let wake: (() => void) | undefined;
  let cancelled = false;
  const call = {
    send: async (request: MessageInitShape<typeof WatchDirectoriesRequestSchema>) => {
      sent.push(request);
    },
    close() {},
    cancel() {
      cancelled = true;
      wake?.();
    },
    responses: (async function* () {
      while (!cancelled) {
        const next = pending.shift();
        if (next) {
          yield next;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      }
    })(),
  };

  const watcher = new DirectoryWatcher('/repo', model, call, restored);
  created = watcher;
  return {
    watcher,
    sent,
    paths: () => [...paths].sort(),
    selected: () => [...selected],
    expanded: () => [...expanded],
    snapshots: () => snapshots,
    cancelled: () => cancelled,
    expand: (path: string, expanded: boolean) => expansion?.(path, expanded),
    respond(response: WatchDirectoriesResponse) {
      pending.push(response);
      wake?.();
    },
  };
}

function unavailable(directory: string) {
  return create(WatchDirectoriesResponseSchema, { relativePath: directory, state: { case: 'unavailable', value: {} } });
}

// A listing of `directory`, where a trailing `/` marks a folder.
function listing(directory: string, names: string[]) {
  return create(WatchDirectoriesResponseSchema, {
    relativePath: directory,
    state: {
      case: 'listing',
      value: {
        entries: names.map((name) => ({
          name: name.replace(/\/$/, ''),
          type: name.endsWith('/') ? DirectoryListing_Entry_Type.DIRECTORY : DirectoryListing_Entry_Type.FILE,
        })),
      },
    },
  });
}

describe('DirectoryWatcher', () => {
  test('watches root', () => {
    const { sent, paths } = fake();

    expect(sent).toEqual([{ root: '/repo', relativePaths: [''] }]);
    expect(paths()).toEqual([]);
  });

  test('adds listed entries', async () => {
    const { respond, paths } = fake();

    respond(listing('', ['src/', 'README.md']));

    await expect.poll(paths).toEqual(['README.md', 'src/']);
  });

  test('removes entries gone from listing', async () => {
    const { respond, paths } = fake();
    respond(listing('', ['src/', 'README.md']));
    await expect.poll(paths).toEqual(['README.md', 'src/']);

    respond(listing('', ['src/']));

    await expect.poll(paths).toEqual(['src/']);
  });

  test('watches opened folder until closed', () => {
    const { expand, sent } = fake();

    expand('src/', true);
    expand('src/', false);

    expect(sent.map((request) => request.relativePaths)).toEqual([[''], ['', 'src'], ['']]);
  });

  test('adds children under folder', async () => {
    const { respond, paths, expand } = fake();
    respond(listing('', ['src/']));
    await expect.poll(paths).toEqual(['src/']);
    expand('src/', true);

    respond(listing('src', ['main.ts', 'lib/']));

    await expect.poll(paths).toEqual(['src/', 'src/lib/', 'src/main.ts']);
  });

  test('relists recreated folder', async () => {
    const { respond, paths, expand } = fake();
    respond(listing('', ['src/']));
    await expect.poll(paths).toEqual(['src/']);
    expand('src/', true);
    respond(listing('src', ['main.ts']));
    respond(listing('', []));
    await expect.poll(paths).toEqual([]);

    respond(listing('', ['src/']));
    respond(listing('src', ['main.ts']));

    await expect.poll(paths).toEqual(['src/', 'src/main.ts']);
  });

  test('clears unavailable root', async () => {
    const { respond, paths } = fake();
    respond(listing('', ['src/']));
    await expect.poll(paths).toEqual(['src/']);

    respond(create(WatchDirectoriesResponseSchema, { relativePath: '', state: { case: 'unavailable', value: {} } }));

    await expect.poll(paths).toEqual([]);
  });

  test('watches remembered folders', () => {
    const { sent } = fake({ expanded: ['src/', 'src/lib/'], selected: [] });

    expect(sent).toEqual([{ root: '/repo', relativePaths: ['', 'src', 'src/lib'] }]);
  });

  test('waits for remembered folders', async () => {
    const { respond, paths } = fake({ expanded: ['src/'], selected: [] });

    respond(listing('', ['src/']));
    await new Promise((resolve) => setTimeout(resolve));

    expect(paths()).toEqual([]);
  });

  test('restores remembered folders in one reset', async () => {
    const { respond, paths, expanded } = fake({ expanded: ['src/', 'src/lib/'], selected: [] });

    respond(listing('', ['src/']));
    respond(listing('src', ['lib/']));
    respond(listing('src/lib', ['a.ts']));

    await expect.poll(paths).toEqual(['src/', 'src/lib/', 'src/lib/a.ts']);
    expect(expanded()).toEqual(['src/', 'src/lib/']);
  });

  test('selects remembered path', async () => {
    const { respond, selected } = fake({ expanded: ['src/'], selected: ['src/main.ts'] });

    respond(listing('', ['src/']));
    respond(listing('src', ['main.ts']));

    await expect.poll(selected).toEqual(['src/main.ts']);
  });

  test('stops watching missing remembered folders', async () => {
    const { respond, sent, watcher } = fake({ expanded: ['gone/', 'src/'], selected: [] });

    respond(listing('', ['src/']));
    respond(listing('src', []));
    respond(
      create(WatchDirectoriesResponseSchema, { relativePath: 'gone', state: { case: 'unavailable', value: {} } }),
    );

    await expect.poll(() => sent.at(-1)?.relativePaths).toEqual(['', 'src']);
    expect(watcher.snapshot()).toEqual({ expanded: ['src/'], selected: [] });
  });

  test('forgets remembered selection gone from listing', async () => {
    const { respond, paths, snapshots } = fake({ expanded: [], selected: ['gone.ts'] });

    respond(listing('', ['src/']));
    await expect.poll(paths).toEqual(['src/']);

    expect(snapshots().at(-1)?.selected).toEqual([]);
  });

  test('ignores listing of unwatched folder', async () => {
    const { respond, sent, paths } = fake({ expanded: ['gone/'], selected: [] });
    respond(listing('', ['src/']));
    respond(unavailable('gone'));
    await expect.poll(() => sent.at(-1)?.relativePaths).toEqual(['']);

    respond(listing('gone', ['a.ts']));
    respond(listing('', ['src/', 'README.md']));

    await expect.poll(paths).toEqual(['README.md', 'src/']);
  });

  test('waits for unavailable root', async () => {
    const { respond, paths, expanded } = fake({ expanded: ['src/'], selected: [] });

    respond(unavailable(''));
    respond(listing('src', ['a.ts']));
    respond(listing('', ['src/']));

    await expect.poll(paths).toEqual(['src/', 'src/a.ts']);
    expect(expanded()).toEqual(['src/']);
  });

  test('keeps folders under unavailable folder', async () => {
    const { respond, paths, sent, watcher } = fake({ expanded: ['src/', 'src/lib/'], selected: [] });

    respond(listing('', ['src/']));
    respond(unavailable('src'));
    respond(unavailable('src/lib'));

    await expect.poll(paths).toEqual(['src/']);
    expect(sent).toHaveLength(1);
    expect(watcher.snapshot()).toEqual({ expanded: ['src/', 'src/lib/'], selected: [] });
  });

  test('reports remembered state until restored', () => {
    const { watcher } = fake({ expanded: ['src/'], selected: ['src/a.ts'] });

    expect(watcher.snapshot()).toEqual({ expanded: ['src/'], selected: ['src/a.ts'] });
  });

  test('cancels stream on dispose', () => {
    const { watcher, cancelled } = fake();

    watcher.dispose();

    expect(cancelled()).toBe(true);
  });
});
