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
    resetPaths: (next: readonly string[] | { preparedInput: unknown }) => {
      paths.clear();
      for (const path of 'preparedInput' in next ? [] : next) {
        paths.add(path);
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
  return {
    watcher,
    sent,
    paths: () => [...paths].sort(),
    selected: () => [...selected],
    cancelled: () => cancelled,
    expand: (path: string, expanded: boolean) => expansion?.(path, expanded),
    respond(response: WatchDirectoriesResponse) {
      pending.push(response);
      wake?.();
    },
  };
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
    const { respond, paths } = fake();
    respond(listing('', ['src/']));

    respond(listing('src', ['main.ts', 'lib/']));

    await expect.poll(paths).toEqual(['src/', 'src/lib/', 'src/main.ts']);
  });

  test('relists recreated folder', async () => {
    const { respond, paths } = fake();
    respond(listing('', ['src/']));
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

  test('expands remembered folder once listed', async () => {
    const { respond, sent } = fake({ expanded: ['src/'], selected: [] });

    respond(listing('', ['src/']));

    await expect.poll(() => sent.at(-1)?.relativePaths).toEqual(['', 'src']);
  });

  test('expands nested remembered folders level by level', async () => {
    const { respond, sent } = fake({ expanded: ['src/', 'src/lib/'], selected: [] });
    respond(listing('', ['src/']));
    await expect.poll(() => sent.at(-1)?.relativePaths).toEqual(['', 'src']);

    respond(listing('src', ['lib/']));

    await expect.poll(() => sent.at(-1)?.relativePaths).toEqual(['', 'src', 'src/lib']);
  });

  test('selects remembered path once listed', async () => {
    const { respond, selected } = fake({ expanded: ['src/'], selected: ['src/main.ts'] });

    respond(listing('', ['src/']));
    respond(listing('src', ['main.ts']));

    await expect.poll(selected).toEqual(['src/main.ts']);
  });

  test('forgets remembered paths gone from listing', async () => {
    const { respond, paths, watcher } = fake({ expanded: ['gone/'], selected: ['gone.ts'] });

    respond(listing('', ['src/']));
    await expect.poll(paths).toEqual(['src/']);

    expect(watcher.snapshot()).toEqual({ expanded: [], selected: [] });
  });

  test('reports open and remembered folders', async () => {
    const { respond, sent, watcher } = fake({ expanded: ['src/', 'src/lib/'], selected: ['src/lib/a.ts'] });

    respond(listing('', ['src/']));
    await expect.poll(() => sent.at(-1)?.relativePaths).toEqual(['', 'src']);

    expect(watcher.snapshot()).toEqual({ expanded: ['src/', 'src/lib/'], selected: ['src/lib/a.ts'] });
  });

  test('cancels stream on dispose', () => {
    const { watcher, cancelled } = fake();

    watcher.dispose();

    expect(cancelled()).toBe(true);
  });
});
