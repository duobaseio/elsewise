import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from 'vitest';

import { type FileTreeModel, useFileTree } from './file-tree';

const PATHS = [
  'daemon/',
  'daemon/src/',
  'daemon/src/main.rs',
  'daemon/src/net/',
  'daemon/src/net/ws.rs',
  'daemon/Cargo.toml',
  'README.md',
] as const;

type Announcement = readonly [path: string, expanded: boolean];

function modelOf(initialExpandedPaths: readonly string[]): FileTreeModel {
  let model: FileTreeModel | null = null;
  function Harness() {
    model = useFileTree({ initialPaths: PATHS, initialExpandedPaths });
    return null;
  }
  renderToString(createElement(Harness));
  if (model == null) throw new Error('no model');
  return model;
}

function watched(initialExpandedPaths: readonly string[] = []) {
  const model = modelOf(initialExpandedPaths);

  const announced: Announcement[] = [];
  const stop = model.onExpansion((path, expanded) => announced.push([path, expanded]));
  return { model, announced, stop };
}

function folder(model: FileTreeModel, path: string) {
  const item = model.getItem(path);
  if (item == null || !('expand' in item)) throw new Error(`no folder at ${path}`);
  return item;
}

test('a folder already expanded at construction is seeded, not announced', () => {
  const { announced } = watched(['daemon/', 'daemon/src/']);
  expect(announced).toEqual([]);
});

test('expanding announces once', () => {
  const { model, announced } = watched();
  folder(model, 'daemon/').expand();
  expect(announced).toEqual([['daemon/', true]]);
});

test('collapsing announces once', () => {
  const { model, announced } = watched(['daemon/']);
  folder(model, 'daemon/').collapse();
  expect(announced).toEqual([['daemon/', false]]);
});

test('a redundant expand announces nothing', () => {
  const { model, announced } = watched();
  folder(model, 'daemon/').expand();
  folder(model, 'daemon/').expand();
  expect(announced).toEqual([['daemon/', true]]);
});

test('selection churn announces nothing', () => {
  const { model, announced } = watched(['daemon/']);
  folder(model, 'daemon/').select();
  model.focusPath('daemon/Cargo.toml');
  expect(announced).toEqual([]);
});

test('a folder revealed by expanding its parent is tracked', () => {
  const { model, announced } = watched();
  folder(model, 'daemon/').expand();
  folder(model, 'daemon/src/').expand();
  expect(announced).toEqual([
    ['daemon/', true],
    ['daemon/src/', true],
  ]);
});

test('a folder revealed three levels down is tracked', () => {
  const { model, announced } = watched();
  folder(model, 'daemon/').expand();
  folder(model, 'daemon/src/').expand();
  folder(model, 'daemon/src/net/').expand();
  expect(announced.map(([path]) => path)).toEqual(['daemon/', 'daemon/src/', 'daemon/src/net/']);
});

test('a parent round-trip does not churn its children', () => {
  const { model, announced } = watched();
  folder(model, 'daemon/').expand();
  folder(model, 'daemon/src/').expand();
  folder(model, 'daemon/').collapse();
  folder(model, 'daemon/').expand();

  expect(announced).toEqual([
    ['daemon/', true],
    ['daemon/src/', true],
    ['daemon/', false],
    ['daemon/', true],
  ]);
});

test('a folder revealed by re-creating it is tracked', () => {
  const { model, announced } = watched(['daemon/']);
  model.remove('daemon/', { recursive: true });
  announced.length = 0;

  // The `add` names a file; the folder it implies arrives without an event of its own.
  model.add('daemon/ws.rs');
  folder(model, 'daemon/').expand();
  expect(announced).toEqual([['daemon/', true]]);
});

test('removing a folder withdraws it', () => {
  const { model, announced } = watched(['daemon/', 'daemon/src/']);
  model.remove('daemon/src/', { recursive: true });

  expect(announced).toEqual([['daemon/src/', false]]);
  expect(model.getItem('daemon/src/')).toBeNull();
});

test('removing a folder withdraws its whole subtree', () => {
  const { model, announced } = watched(['daemon/', 'daemon/src/']);
  model.remove('daemon/', { recursive: true });
  expect(announced).toEqual([
    ['daemon/', false],
    ['daemon/src/', false],
  ]);
});

test('a move re-tracks the folder under its new path', () => {
  const { model, announced } = watched(['daemon/']);
  model.move('daemon/src/', 'daemon/core/');

  folder(model, 'daemon/core/').expand();
  expect(announced).toEqual([['daemon/core/', true]]);
});

test('moving an open folder closes the old path and opens the new one', () => {
  const { model, announced } = watched(['daemon/', 'daemon/src/']);
  model.move('daemon/src/', 'daemon/core/');

  expect(announced).toEqual([
    ['daemon/src/', false],
    ['daemon/core/', true],
  ]);
});

test('a folder open inside a closed parent is announced when the parent opens', () => {
  const model = modelOf(['daemon/', 'daemon/src/']);
  folder(model, 'daemon/').collapse();

  const announced: Announcement[] = [];
  model.onExpansion((path, expanded) => announced.push([path, expanded]));

  folder(model, 'daemon/').expand();
  expect(announced).toEqual([
    ['daemon/', true],
    ['daemon/src/', true],
  ]);
});

test('a reset tracks folders the new tree leaves collapsed', () => {
  const { model, announced } = watched(['daemon/']);
  model.resetPaths(['tools/', 'tools/nested/', 'tools/nested/cli.dart']);
  announced.length = 0;

  folder(model, 'tools/').expand();
  folder(model, 'tools/nested/').expand();
  expect(announced).toEqual([
    ['tools/', true],
    ['tools/nested/', true],
  ]);
});

test('a reset withdraws the folders it dropped, then tracks the new tree', () => {
  const { model, announced } = watched(['daemon/']);
  model.resetPaths(['tools/', 'tools/cli.dart', 'LICENSE']);

  expect(announced).toEqual([['daemon/', false]]);

  folder(model, 'tools/').expand();
  expect(announced).toEqual([
    ['daemon/', false],
    ['tools/', true],
  ]);
});

test('unsubscribing stops the announcements', () => {
  const { model, announced, stop } = watched();
  stop();
  folder(model, 'daemon/').expand();
  expect(announced).toEqual([]);
});
