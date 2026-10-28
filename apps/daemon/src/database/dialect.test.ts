import { DatabaseSync } from 'node:sqlite';
import { type Generated, Kysely } from 'kysely';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { NodeSqliteDialect } from './dialect';

interface Schema {
  item: { id: Generated<number>; label: string; done: number };
}

let db: Kysely<Schema>;

beforeEach(() => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    create table item (
        id integer primary key autoincrement,
        label text not null,
        done integer not null
    )
  `);
  db = new Kysely<Schema>({ dialect: new NodeSqliteDialect(database) });
});

afterEach(async () => {
  await db.destroy();
});

test('runs select, insert, update and delete statements', async () => {
  const inserted = await db.insertInto('item').values({ label: 'a', done: 0 }).executeTakeFirst();
  expect(inserted).toMatchObject({ numInsertedOrUpdatedRows: 1n, insertId: 1n });
  const returned = await db.insertInto('item').values({ label: 'b', done: 0 }).returning(['id', 'label']).execute();
  expect(returned).toEqual([{ id: 2, label: 'b' }]);
  const updated = await db.updateTable('item').set({ done: 1 }).executeTakeFirst();
  expect(updated.numUpdatedRows).toBe(2n);
  expect(await db.selectFrom('item').select(['id', 'label', 'done']).orderBy('id').execute()).toEqual([
    { id: 1, label: 'a', done: 1 },
    { id: 2, label: 'b', done: 1 },
  ]);
  const deleted = await db.deleteFrom('item').where('id', '=', 1).executeTakeFirst();
  expect(deleted.numDeletedRows).toBe(1n);
});

test('rolls a failed transaction back', async () => {
  await expect(
    db.transaction().execute(async (trx) => {
      await trx.insertInto('item').values({ label: 'a', done: 0 }).execute();
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  expect(await db.selectFrom('item').select('id').execute()).toEqual([]);
});

test('keeps a statement outside a transaction out of it', async () => {
  let inside: Promise<unknown> | undefined;
  await expect(
    db.transaction().execute(async (trx) => {
      await trx.insertInto('item').values({ label: 'in', done: 0 }).execute();
      inside = db.insertInto('item').values({ label: 'out', done: 0 }).execute(); // Waits for the connection.
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  await inside;
  expect(await db.selectFrom('item').select('label').execute()).toEqual([{ label: 'out' }]);
});
