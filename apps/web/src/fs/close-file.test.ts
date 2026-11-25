import { Code, TransportError } from '@elsewise/transport';
import { describe, expect, test, vi } from 'vitest';
import type { ApplicationManager } from '@/application-manager';
import type { DockManager } from '@/dock/dock-manager';
import { fakeFileSystem } from '../../test/fake-file-system';
import { closeFile } from './close-file';
import { FileHandle } from './file-handle';
import { FileHandleStore } from './file-handle-store';

const WORKSPACE = { daemon: 'd', project: 'p', workspace: 'w' };
const PANEL = { id: 'file:1', type: 'file', tab: true, closable: true, relativePath: 'main.ts' } as const;

// Opens main.ts with unsaved text, and returns what closing its panel resolves to once the dialog is given `actions`.
async function open(...actions: Awaited<ReturnType<FileHandleStore['openCloseDialog']>>[]) {
  const fake = fakeFileSystem();
  fake.put('main.ts', 'let a;');
  const file = new FileHandle(fake.fileSystem, '/repo', 'main.ts');
  fake.report('main.ts');
  await expect.poll(() => file.state.type).toBe('text');
  file.document = () => 'let b;';

  const files = new FileHandleStore();
  files.add(WORKSPACE, file);
  const asked = vi.spyOn(files, 'openCloseDialog').mockImplementation(async () => actions.shift() ?? 'cancel');
  const application = { files } as ApplicationManager;
  const dock = { workspaceId: WORKSPACE } as DockManager;
  return { fake, file, files, asked, application, dock, close: () => closeFile(application, dock, PANEL) };
}

describe('closeFile', () => {
  test('allows panel of file that is not open', async () => {
    const { fake, application, dock } = await open();

    await expect(closeFile(application, dock, { ...PANEL, relativePath: 'closed.ts' })).resolves.toBe(true);

    expect(fake.writes).toEqual([]);
  });

  test('allows clean file without saving it', async () => {
    const { fake, file, asked, close } = await open();
    file.document = null;

    await expect(close()).resolves.toBe(true);

    expect(fake.writes).toEqual([]);
    expect(asked).not.toHaveBeenCalled();
  });

  test('saves text of editor', async () => {
    const { fake, asked, close } = await open();

    await expect(close()).resolves.toBe(true);

    expect(fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let b;' }]);
    expect(asked).not.toHaveBeenCalled();
  });

  test('overwrites file that changed on disk', async () => {
    const { fake, file, asked, close } = await open('overwrite');
    fake.put('main.ts', 'let z;');

    await expect(close()).resolves.toBe(true);

    expect(asked).toHaveBeenCalledExactlyOnceWith(file, null);
    expect(fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let b;' }]);
  });

  test('allows file that changed on disk without saving it', async () => {
    const { fake, close } = await open('discard');
    fake.put('main.ts', 'let z;');

    await expect(close()).resolves.toBe(true);

    expect(fake.writes).toEqual([]);
  });

  test('refuses file that changed on disk', async () => {
    const { fake, close } = await open('cancel');
    fake.put('main.ts', 'let z;');

    await expect(close()).resolves.toBe(false);

    expect(fake.writes).toEqual([]);
  });

  test('allows file whose save failed', async () => {
    const { fake, file, asked, close } = await open('discard');
    vi.spyOn(fake.fileSystem, 'writeFile').mockRejectedValue(new TransportError(Code.UNAVAILABLE, 'unreachable'));

    await expect(close()).resolves.toBe(true);

    expect(asked).toHaveBeenCalledExactlyOnceWith(file, expect.stringContaining('unreachable'));
  });

  test('refuses file whose save failed', async () => {
    const { fake, close } = await open('cancel');
    vi.spyOn(fake.fileSystem, 'writeFile').mockRejectedValue(new TransportError(Code.UNAVAILABLE, 'unreachable'));

    await expect(close()).resolves.toBe(false);
  });

  test('reports failure of overwrite', async () => {
    const { fake, asked, close } = await open('overwrite', 'discard');
    const write = fake.fileSystem.writeFile;
    vi.spyOn(fake.fileSystem, 'writeFile').mockImplementation(async (request) => {
      if (request.overwrite) {
        throw new TransportError(Code.UNAVAILABLE, 'unreachable');
      }
      return write(request);
    });
    fake.put('main.ts', 'let z;');

    await expect(close()).resolves.toBe(true);

    expect(asked.mock.calls.map(([, failure]) => failure)).toEqual([null, expect.stringContaining('unreachable')]);
  });
});
