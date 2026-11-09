import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_WORKSPACE_STATE } from '@elsewise/bridge';
import { frontendDataDir } from '@elsewise/core/node';
import { ipcMain } from 'electron';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { handleWorkspaces } from './workspaces';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('@elsewise/core/node', async (importOriginal) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const home = mkdtempSync(join(tmpdir(), 'elsewise-'));
  return {
    ...(await importOriginal<typeof import('@elsewise/core/node')>()),
    frontendDataDir: () => join(home, 'frontend'),
  };
});

const WORKSPACE = { daemon: 'local', project: 'p', workspace: 'w' };
const FILE = path.join(frontendDataDir(), 'workspaces', 'local', 'p', 'w.json');

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(frontendDataDir(), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(path.dirname(frontendDataDir()), { recursive: true, force: true });
});

function handler(channel: string) {
  handleWorkspaces();

  return vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1] as unknown as (
    event?: unknown,
    ...values: unknown[]
  ) => unknown;
}

function write(value: unknown) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, typeof value === 'string' ? value : JSON.stringify(value));
}

describe('workspaces:load', () => {
  test('defaults without file', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(handler('workspaces:load')({}, WORKSPACE)).toEqual(DEFAULT_WORKSPACE_STATE);
    expect(error).not.toHaveBeenCalled();
  });

  test('defaults on malformed JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    write('{not json');

    expect(handler('workspaces:load')({}, WORKSPACE)).toEqual(DEFAULT_WORKSPACE_STATE);
    expect(error).toHaveBeenCalledOnce();
  });

  test('fills invalid values', () => {
    write({ fileTree: { expanded: 'src/', selected: ['a.ts'] } });

    expect(handler('workspaces:load')({}, WORKSPACE)).toEqual({
      dock: null,
      fileTree: { expanded: [], selected: ['a.ts'] },
    });
  });

  test('rejects unsafe id', () => {
    expect(() => handler('workspaces:load')({}, { ...WORKSPACE, project: '..' })).toThrow();
  });
});

describe('workspaces:save', () => {
  test('writes state per workspace', () => {
    const state = { dock: { grid: {} }, fileTree: { expanded: ['src/'], selected: ['src/a.ts'] } };

    handler('workspaces:save')({}, WORKSPACE, state);
    handler('workspaces:save')({}, { ...WORKSPACE, workspace: 'other' }, DEFAULT_WORKSPACE_STATE);

    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual(state);
    expect(handler('workspaces:load')({}, WORKSPACE)).toEqual(state);
  });

  test('rejects non-object', () => {
    expect(() => handler('workspaces:save')({}, WORKSPACE, 'state')).toThrow();
  });

  test('rejects unsafe id', () => {
    expect(() =>
      handler('workspaces:save')({}, { ...WORKSPACE, workspace: '../w' }, DEFAULT_WORKSPACE_STATE),
    ).toThrow();
  });
});

describe('workspaces:delete', () => {
  test('deletes workspace', () => {
    handler('workspaces:save')({}, WORKSPACE, DEFAULT_WORKSPACE_STATE);
    handler('workspaces:save')({}, { ...WORKSPACE, workspace: 'other' }, DEFAULT_WORKSPACE_STATE);

    handler('workspaces:delete')({}, WORKSPACE);

    expect(fs.existsSync(FILE)).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(FILE), 'other.json'))).toBe(true);
  });

  test('deletes every workspace in project', () => {
    handler('workspaces:save')({}, WORKSPACE, DEFAULT_WORKSPACE_STATE);
    handler('workspaces:save')({}, { ...WORKSPACE, workspace: 'other' }, DEFAULT_WORKSPACE_STATE);

    handler('workspaces:delete')({}, { daemon: 'local', project: 'p' });

    expect(fs.existsSync(path.dirname(FILE))).toBe(false);
  });

  test('ignores missing file', () => {
    expect(() => handler('workspaces:delete')({}, WORKSPACE)).not.toThrow();
  });

  test('rejects unsafe id', () => {
    expect(() => handler('workspaces:delete')({}, { daemon: 'local', project: '..' })).toThrow();
  });
});
