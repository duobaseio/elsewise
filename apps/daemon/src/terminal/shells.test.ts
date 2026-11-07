import { Code } from '@elsewise/transport';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { type DatabaseHandle, openDatabase } from '../database/database';
import { MIGRATIONS } from '../gen/migrations';
import { ProjectStore } from '../project/store';
import { Shells } from './shells';
import { TerminalStore } from './store';

const SIZE = { columns: 80, rows: 24 };

let db: DatabaseHandle;
let shells: Shells;
let workspaceId: string;
let terminalId: string;

beforeEach(async () => {
  db = openDatabase(':memory:', MIGRATIONS);
  const store = new TerminalStore(db.database);
  shells = new Shells(store, { scrollback: 100, saveDelayMs: 50, maxQueuedBytes: 1024 * 1024 });
  const { workspace } = await new ProjectStore(db.database).createProject({
    name: 'Demo',
    folder: 'demo',
    absolute_path: '/demo',
  });
  workspaceId = workspace.id;
  terminalId = (await store.createTerminal({ workspace_id: workspaceId, name: 'demo', columns: 80, rows: 24 })).id;
});

afterEach(async () => {
  await shells.close();
  await db.close();
});

function start() {
  return shells.start(terminalId, process.cwd(), SIZE);
}

describe('kill', () => {
  test('refuses to start the shell again until released', async () => {
    const shell = await start();
    const release = await shells.kill(terminalId, 'deleted');
    expect(shell.exit).toBeDefined();
    await expect(start()).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    release();

    // Start works because the row on the database isn't deleted in this test.
    expect((await start()).exit).toBeUndefined();
  });
});

describe('killWorkspace', () => {
  test("refuses to start the workspace's shells until released", async () => {
    const shell = await start();
    const release = await shells.killWorkspace(workspaceId, 'deleted');
    expect(shell.exit).toBeDefined();
    await expect(start()).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    release();

    // Start works because the row on the database isn't deleted in this test.
    expect((await start()).exit).toBeUndefined();
  });
});
