import { expect, test } from 'vitest';
import { Progress_Phase as Phase } from '../../gen/elsewise/daemon/git/v1/git_pb';
import { ProgressParser } from './progress';

test('reports each phase and percentage', () => {
  const seen: unknown[] = [];
  const parser = new ProgressParser((progress) => seen.push(progress));
  parser.push('remote: Enumerating objects: 5, done.\nremote: Counting objects:  20% (1/5)\rremote: Count');
  parser.push('ing objects:  20% (1/5)\rremote: Counting objects: 100% (5/5), done.\n');
  parser.push('Receiving objects:  50% (2/4)\rReceiving objects: 100% (4/4), 1.2 KiB | 1.2 MiB/s, done.\n');
  parser.push('Resolving deltas: 100% (1/1), done.\nUpdating files: 100% (3/3), done.\nSomething else: 50% (1/2)\n');
  expect(seen).toEqual([
    { phase: Phase.COUNTING, percent: 20 },
    { phase: Phase.COUNTING, percent: 100 },
    { phase: Phase.RECEIVING, percent: 50 },
    { phase: Phase.RECEIVING, percent: 100 },
    { phase: Phase.RESOLVING, percent: 100 },
    { phase: Phase.CHECKING_OUT, percent: 100 },
    { phase: Phase.OTHER, percent: 50 },
  ]);
});

test('reads bytes and caps the percentage at 100', () => {
  const seen: unknown[] = [];
  const parser = new ProgressParser((progress) => seen.push(progress));
  parser.push(Buffer.from('Receiving objects: 120% (6/5)\n'));
  expect(seen).toEqual([{ phase: Phase.RECEIVING, percent: 100 }]);
});
