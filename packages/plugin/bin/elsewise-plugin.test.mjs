import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const COMMAND = fileURLToPath(new URL('./elsewise-plugin.mjs', import.meta.url));
const MANIFEST = { id: 'hello', name: 'Hello', version: '1.0.0', elsewise: '^1.0.0', frontend: {} };

let folder;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'elsewise-plugin-'));
});

afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

function run(manifest, pkg) {
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify(pkg));
  return spawnSync(process.execPath, [COMMAND, 'manifest'], { cwd: folder, encoding: 'utf8' });
}

describe('elsewise-plugin manifest', () => {
  test('writes manifest with listing fields from package.json', () => {
    const { status, stderr } = run(MANIFEST, { description: 'Says hello.', license: 'MIT' });

    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(folder, 'dist', 'manifest.json'), 'utf8'))).toEqual({
      ...MANIFEST,
      description: 'Says hello.',
      license: 'MIT',
    });
  });

  test('rejects malformed manifest', () => {
    const { status, stderr } = run({ ...MANIFEST, elsewise: 'latest' }, {});

    expect(status).toBe(1);
    expect(stderr).toContain('[plugin] the manifest is malformed');
    expect(fs.existsSync(path.join(folder, 'dist'))).toBe(false);
  });
});
