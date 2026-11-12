import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDaemon } from './daemon';
import { dataDirectory } from './directories';

let root: string;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-daemon-')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10 });
});

describe('createDaemon', () => {
  test('starts without plugins when plugins.json is malformed', async () => {
    const data = dataDirectory(path.join(root, 'data'));
    await fs.mkdir(data.root);
    await fs.writeFile(data.pluginsManifest, '[1]');

    const daemon = await createDaemon({ dataDirectory: data.root, codeDirectory: path.join(root, 'code') });
    await daemon.close();

    expect(console.error).toHaveBeenCalledWith('Plugins failed to load', expect.any(Error));
  });

  test('serves while plugin is enabling', async () => {
    const data = dataDirectory(path.join(root, 'data'));
    const folder = path.join(data.plugins, 'a', 'daemon');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(data.root, 'recorder.mjs'),
      'export const events = [];\nexport const gate = Promise.withResolvers();\n',
    );
    await fs.writeFile(
      path.join(data.plugins, 'a', 'manifest.json'),
      JSON.stringify({ id: 'a', name: 'a', version: '1.0.0', elsewise: '*', frontend: {}, daemon: {} }),
    );
    await fs.writeFile(
      path.join(folder, 'main.js'),
      `
import { events, gate } from '../../../recorder.mjs';
export default () => ({
  async onEnable() {
    events.push('enable started');
    await gate.promise;
    events.push('enable finished');
  },
  onDisable() {
    events.push('disable');
  },
});
`,
    );
    await fs.writeFile(data.pluginsManifest, JSON.stringify([{ id: 'a', enabled: true }]));
    const { events, gate } = await import(pathToFileURL(path.join(data.root, 'recorder.mjs')).href);

    const daemon = await createDaemon({ dataDirectory: data.root, codeDirectory: path.join(root, 'code') });
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    gate.resolve();
    await daemon.close();

    expect(events).toEqual(['enable started', 'enable finished', 'disable']);
  });
});
