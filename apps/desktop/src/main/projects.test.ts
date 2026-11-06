import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PROJECT_LAYOUT } from '@elsewise/bridge';
import { frontendDataDir } from '@elsewise/core/node';
import { ipcMain } from 'electron';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { handleProjects } from './projects';

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

const FILE = path.join(frontendDataDir(), 'projects.json');

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(frontendDataDir(), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(path.dirname(frontendDataDir()), { recursive: true, force: true });
});

function handler(channel: string) {
  handleProjects();

  return vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1] as unknown as (
    event?: unknown,
    ...values: unknown[]
  ) => unknown;
}

function write(value: unknown) {
  fs.mkdirSync(frontendDataDir(), { recursive: true });
  fs.writeFileSync(FILE, typeof value === 'string' ? value : JSON.stringify(value));
}

describe('projects:load', () => {
  test('defaults without file', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(handler('projects:load')()).toEqual(DEFAULT_PROJECT_LAYOUT);
    expect(error).not.toHaveBeenCalled();
  });

  test('defaults on malformed JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    write('{not json');

    expect(handler('projects:load')()).toEqual(DEFAULT_PROJECT_LAYOUT);
    expect(error).toHaveBeenCalledOnce();
  });

  test('fills invalid values', () => {
    write({ daemons: { local: { projects: [{ id: 'a', expanded: 'no' }] } } });

    expect(handler('projects:load')()).toEqual({
      daemons: { local: { projects: [{ id: 'a', expanded: true, workspaces: [] }] } },
    });
  });
});

describe('projects:save', () => {
  test('writes layout', () => {
    const layout = { daemons: { local: { projects: [{ id: 'a', expanded: false, workspaces: ['b', 'c'] }] } } };

    handler('projects:save')({}, layout);

    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual(layout);
  });

  test('rejects non-object', () => {
    expect(() => handler('projects:save')({}, 'layout')).toThrow();
  });
});
