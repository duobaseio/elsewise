import { DatabaseSync } from 'node:sqlite';
import { expect, test } from 'vitest';
import { migrate } from './migrate';

const FIRST = {
  version: '1',
  description: 'first',
  sql: 'create table a (id integer primary key); create table b (id integer primary key);',
};
const SECOND = { version: '2', description: 'second', sql: 'alter table a add column label text;' };

function tables(database: DatabaseSync): string[] {
  return database
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
    .all()
    .map((row) => row.name as string);
}

test('applies new migrations once and records them', () => {
  const database = new DatabaseSync(':memory:');
  expect(migrate(database, [FIRST])).toEqual(['1']);
  expect(migrate(database, [FIRST, SECOND])).toEqual(['2']);
  expect(migrate(database, [FIRST, SECOND])).toEqual([]);
  expect(tables(database)).toEqual(['a', 'b', 'schema_revision']);
  expect(database.prepare('select version, description from schema_revision order by version').all()).toEqual([
    { version: '1', description: 'first' },
    { version: '2', description: 'second' },
  ]);
});

test('rolls back a failing migration', () => {
  const database = new DatabaseSync(':memory:');
  const broken = {
    version: '1',
    description: 'broken',
    sql: 'create table a (id integer primary key); create table a (id);',
  };
  expect(() => migrate(database, [broken])).toThrow(/already exists/);
  expect(tables(database)).toEqual(['schema_revision']);
});

test('drops and recreates a parent table without cascading delete', () => {
  // This test mimics how Atlas Go generates its migration file.
  const database = new DatabaseSync(':memory:');
  database.exec('pragma foreign_keys = on');
  const parent = {
    version: '1',
    description: 'parent',
    sql: `create table parent (id integer primary key);
      create table child (id integer primary key, parent_id integer references parent (id) on delete cascade);
      insert into parent (id) values (1); insert into child (id, parent_id) values (1, 1);`,
  };
  const rebuild = {
    version: '2',
    description: 'rebuild',
    sql: `PRAGMA foreign_keys = off;
      create table new_parent (id integer primary key, label text);
      insert into new_parent (id) select id from parent;
      drop table parent;
      alter table new_parent rename to parent;
      PRAGMA foreign_keys = on;`,
  };
  expect(migrate(database, [parent, rebuild])).toEqual(['1', '2']);
  expect(database.prepare('select count(*) as n from child').get()).toEqual({ n: 1 });
  expect(database.prepare('pragma foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(() => database.exec('insert into child (id, parent_id) values (2, 9)')).toThrow(/FOREIGN KEY/);
});

test('rolls back a migration that leaves a foreign key violated', () => {
  const database = new DatabaseSync(':memory:');
  const parent = {
    version: '1',
    description: 'parent',
    sql: 'create table parent (id integer primary key); create table child (parent_id integer references parent (id));',
  };
  const orphan = { version: '2', description: 'orphan', sql: 'insert into child (parent_id) values (9);' };
  expect(() => migrate(database, [parent, orphan])).toThrow(/violate a foreign key/);
  expect(database.prepare('select count(*) as n from child').get()).toEqual({ n: 0 });
});

test('refuses a database with an unknown migration', () => {
  const database = new DatabaseSync(':memory:');
  migrate(database, [FIRST, SECOND]);
  expect(() => migrate(database, [FIRST])).toThrow(/2_second/);
});

test('refuses a database whose migration has changed since it was applied', () => {
  const database = new DatabaseSync(':memory:');
  migrate(database, [FIRST]);
  expect(() => migrate(database, [{ ...FIRST, sql: `${FIRST.sql} create table c (id integer primary key);` }])).toThrow(
    /1_first has changed/,
  );
  expect(tables(database)).toEqual(['a', 'b', 'schema_revision']);
});
