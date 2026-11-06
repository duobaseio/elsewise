import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { type DatabaseHandle, openDatabase } from '../database/database';
import { MIGRATIONS } from '../gen/migrations';
import { ProjectStore } from '../project/store';
import { TerminalStore } from './store';

let db: DatabaseHandle;
let projects: ProjectStore;
let store: TerminalStore;
let workspaceId: string;

beforeEach(async () => {
  db = openDatabase(':memory:', MIGRATIONS);
  projects = new ProjectStore(db.database);
  store = new TerminalStore(db.database);
  const { workspace } = await projects.createProject({ name: 'Demo', folder: 'demo', absolute_path: '/demo' });
  workspaceId = workspace.id;
});

afterEach(async () => {
  await db.close();
});

function create(name: string, workspace = workspaceId) {
  return store.createTerminal({ workspace_id: workspace, name, columns: 80, rows: 24 });
}

describe('getTerminals', () => {
  test('returns the terminals sorted by oldest first', async () => {
    const other = await projects.createProject({ name: 'Other', folder: 'other', absolute_path: '/other' });
    const a = await create('a');
    const b = await create('b');
    await create('c', other.workspace.id);
    expect((await store.getTerminals(workspaceId)).map((terminal) => terminal.id)).toEqual([a.id, b.id]);
  });

  test('returns the terminals of every workspace when no id is given', async () => {
    const other = await projects.createProject({ name: 'Other', folder: 'other', absolute_path: '/other' });
    await create('a');
    await create('b', other.workspace.id);
    expect((await store.getTerminals()).map((terminal) => terminal.name)).toEqual(['a', 'b']);
  });
});

describe('getTerminal', () => {
  test('returns the terminal or undefined', async () => {
    const terminal = await create('a');
    expect(await store.getTerminal(terminal.id)).toEqual(terminal);
    expect(await store.getTerminal('missing')).toBeUndefined();
  });
});

describe('getWorkspace', () => {
  test('returns the workspace with the name of its project', async () => {
    expect(await store.getWorkspace(workspaceId)).toMatchObject({
      id: workspaceId,
      name: 'Demo',
      project_name: 'Demo',
    });
    expect(await store.getWorkspace('missing')).toBeUndefined();
  });
});

describe('createTerminal', () => {
  test('creates the terminal without shell state', async () => {
    const terminal = await create('a');
    expect(terminal).toMatchObject({
      workspace_id: workspaceId,
      name: 'a',
      columns: 80,
      rows: 24,
      exit_code: null,
      exit_signal: null,
      buffer: null,
    });
    await expect(create('a', 'missing')).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe('updateTerminal', () => {
  test('renames the terminal', async () => {
    const terminal = await create('a');
    expect(await store.updateTerminal(terminal.id, { name: 'b' })).toEqual({ ...terminal, name: 'b' });
    expect(await store.updateTerminal('missing', { name: 'b' })).toBeUndefined();
  });

  test('saves the size, the buffer and the exit', async () => {
    const terminal = await create('a');
    const buffer = Buffer.from('hello');
    const saved = await store.updateTerminal(terminal.id, { columns: 100, rows: 30, buffer, exit_code: 1 });
    expect(saved).toMatchObject({ columns: 100, rows: 30, exit_code: 1 });
    expect(Buffer.from(saved?.buffer ?? '').toString()).toBe('hello');
    expect(await store.updateTerminal(terminal.id, { exit_code: null, exit_signal: 'SIGHUP' })).toMatchObject({
      exit_code: null,
      exit_signal: 'SIGHUP',
    });
    expect(await store.updateTerminal('missing', { exit_code: 1 })).toBeUndefined();
  });
});

describe('deleteTerminal', () => {
  test('deletes the terminal', async () => {
    const terminal = await create('a');
    expect(await store.deleteTerminal(terminal.id)).toBe(true);
    expect(await store.deleteTerminal(terminal.id)).toBe(false);
    expect(await store.getTerminals()).toEqual([]);
  });
});
