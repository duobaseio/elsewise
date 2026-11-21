import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loginEnvironment, mergeEnvironment, pathOf } from './environment';

describe.skipIf(process.platform === 'win32')('loginEnvironment', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-environment-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  /**
   * Writes a shell that runs the script before the command it is given.
   */
  async function shell(script: string): Promise<string> {
    const file = path.join(directory, 'shell');
    await fs.writeFile(file, `#!/bin/sh\n${script}\nexec /bin/sh -c "$2"\n`, { mode: 0o755 });
    return file;
  }

  test('returns what the start-up files export', async () => {
    const environment = await loginEnvironment(
      await shell('echo welcome\nexport PATH="/opt/tools:$PATH"\nexport MULTILINE="a\nb=c"'),
    );
    expect(environment.PATH).toMatch(/^\/opt\/tools:/);
    expect(environment.MULTILINE).toBe('a\nb=c');
  });

  test('leaves out what the shell sets for itself', async () => {
    const environment = await loginEnvironment(await shell('export SHLVL=3 OLDPWD=/'));
    expect(environment).not.toHaveProperty('SHLVL');
    expect(environment).not.toHaveProperty('PWD');
    expect(environment).not.toHaveProperty('OLDPWD');
  });

  test('leaves out what the shell is started with', async () => {
    const environment = await loginEnvironment(await shell('export A=1'));
    expect(environment.A).toBe('1');
    expect(environment).not.toHaveProperty('DISABLE_AUTO_UPDATE');
  });

  test('does not wait for what the start-up files leave running', async () => {
    const environment = await loginEnvironment(await shell('sleep 30 &\nexport A=1'));
    expect(environment.A).toBe('1');
  });

  test('returns nothing when the shell fails', async () => {
    expect(await loginEnvironment(await shell('exit 1'))).toEqual({});
    expect(await loginEnvironment(path.join(directory, 'missing'))).toEqual({});
  });

  test('returns nothing when the shell does not finish in time', async () => {
    expect(await loginEnvironment(await shell('sleep 10'), 100)).toEqual({});
    expect(await loginEnvironment(await shell("trap '' TERM\nsleep 30 &\nsleep 30"), 1_000)).toEqual({});
  });
});

test.skipIf(process.platform !== 'win32')('loginEnvironment returns nothing on Windows', async () => {
  expect(await loginEnvironment()).toEqual({});
});

describe('mergeEnvironment', () => {
  test('lets a later environment override an earlier one', () => {
    expect(mergeEnvironment([{ A: '1', B: '2', C: undefined }, { B: '3' }])).toEqual({ A: '1', B: '3' });
  });

  test.skipIf(process.platform === 'win32')('keeps names that differ by case apart', () => {
    expect(mergeEnvironment([{ Path: 'a' }, { PATH: 'b' }])).toEqual({ Path: 'a', PATH: 'b' });
  });

  test.skipIf(process.platform !== 'win32')('replaces a name that differs by case on Windows', () => {
    expect(mergeEnvironment([{ Path: 'a', Other: '1' }, { PATH: 'b' }])).toEqual({ Other: '1', PATH: 'b' });
    expect(mergeEnvironment([{ PATH: 'a' }, { path: 'b' }, { Path: 'c' }])).toEqual({ Path: 'c' });
  });
});

describe('pathOf', () => {
  test('reads PATH', () => {
    expect(pathOf({ PATH: 'a' })).toBe('a');
    expect(pathOf({})).toBeUndefined();
  });

  test.skipIf(process.platform === 'win32')('ignores another spelling', () => {
    expect(pathOf({ Path: 'a' })).toBeUndefined();
  });

  test.skipIf(process.platform !== 'win32')('reads any spelling on Windows', () => {
    expect(pathOf({ Path: 'a' })).toBe('a');
    expect(pathOf({ path: 'a' })).toBe('a');
  });
});
