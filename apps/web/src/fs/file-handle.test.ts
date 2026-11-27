import { Code } from '@elsewise/transport';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fakeFileSystem } from '../../test/fake-file-system';
import { FileHandle } from './file-handle';

function open(content?: string | Uint8Array) {
  const fake = fakeFileSystem();
  if (content !== undefined) {
    fake.put('main.ts', content);
  }
  const file = new FileHandle(fake.fileSystem, '/repo', 'main.ts');
  fake.report('main.ts');
  return { fake, file };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FileHandle', () => {
  test('reads watched file', async () => {
    const { file } = open('let a;');

    await expect.poll(() => file.state).toEqual({ type: 'text', content: 'let a;' });
  });

  test('keeps content of binary file', async () => {
    const { file } = open(new Uint8Array([0, 1]));

    await expect.poll(() => file.state).toEqual({ type: 'binary', content: new Uint8Array([0, 1]) });
  });

  test('shows missing file as unavailable', async () => {
    const { file } = open();

    await expect.poll(() => file.state.type).toBe('unavailable');
  });

  test('reports change on disk', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    const listener = vi.fn();
    file.onDiskChange(listener);

    fake.put('main.ts', 'let b;');
    fake.report('main.ts');

    await expect.poll(() => listener.mock.calls).toHaveLength(1);
    expect(file.state).toEqual({ type: 'text', content: 'let b;' });
  });

  test('reports change of binary file on disk', async () => {
    const { fake, file } = open(new Uint8Array([0, 1]));
    await expect.poll(() => file.state.type).toBe('binary');
    const listener = vi.fn();
    file.onDiskChange(listener);

    fake.put('main.ts', new Uint8Array([0, 2]));
    fake.report('main.ts');

    await expect.poll(() => listener.mock.calls).toHaveLength(1);
    expect(file.state).toEqual({ type: 'binary', content: new Uint8Array([0, 2]) });
  });

  test('skips report on save', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    const listener = vi.fn();
    file.onDiskChange(listener);

    await file.save('let b;');
    fake.report('main.ts');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(listener).not.toHaveBeenCalled();
  });

  test('skips report of earlier save', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    const listener = vi.fn();
    file.onDiskChange(listener);

    await file.save('let b;');
    fake.report('main.ts');
    await file.save('let c;');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(listener).not.toHaveBeenCalled();
  });

  test('drops load that save overtook', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    const listener = vi.fn();
    file.onDiskChange(listener);
    const read = fake.fileSystem.readFile;
    let release = () => {};
    vi.spyOn(fake.fileSystem, 'readFile').mockImplementationOnce(async (request) => {
      const response = await read(request);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return response;
    });

    fake.put('main.ts', 'let b;');
    fake.report('main.ts');
    await expect.poll(() => fake.reads).toHaveLength(2);
    await file.save('let c;', { overwrite: true });
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(file.state).toEqual({ type: 'text', content: 'let c;' });
    expect(listener).not.toHaveBeenCalled();
  });

  test('keeps load that refused save overtook', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    const read = fake.fileSystem.readFile;
    let release = () => {};
    vi.spyOn(fake.fileSystem, 'readFile').mockImplementationOnce(async (request) => {
      const response = await read(request);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return response;
    });

    fake.put('main.ts', 'let b;');
    fake.report('main.ts');
    await expect.poll(() => fake.reads).toHaveLength(2);
    await expect(file.save('let c;')).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    release();

    await expect.poll(() => file.state).toEqual({ type: 'text', content: 'let b;' });
  });

  test('skips report of known content', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');

    fake.report('main.ts');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await file.save('let b;');
    fake.report('main.ts');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fake.reads).toEqual(['main.ts']);
  });

  test('saves over content read', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');

    await file.save('let b;');

    expect(fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let b;' }]);
    expect(file.state).toEqual({ type: 'text', content: 'let b;' });
  });

  test('keeps byte order mark on save', async () => {
    const { fake, file } = open('\uFEFFlet a;');
    await expect.poll(() => file.state).toEqual({ type: 'text', content: 'let a;' });

    await file.save('let b;');

    expect(fake.writes).toEqual([{ relativePath: 'main.ts', content: '\uFEFFlet b;' }]);
    expect(file.state).toEqual({ type: 'text', content: 'let b;' });
  });

  test('refuses save over unread change', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    fake.put('main.ts', 'let b;');

    await expect(file.save('let c;')).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    expect(fake.writes).toEqual([]);
  });

  test('saves after refused save', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    fake.put('main.ts', 'let b;');
    await expect(file.save('let c;')).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });

    await file.save('let d;', { overwrite: true });

    expect(fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let d;' }]);
  });

  test('overwrites unread change', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    fake.put('main.ts', 'let b;');

    await file.save('let c;', { overwrite: true });

    expect(fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let c;' }]);
    expect(fake.reads).toEqual(['main.ts']);
  });

  test('shows file as unavailable when watch ends before load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = fakeFileSystem();
    fake.put('main.ts', 'let a;');
    const file = new FileHandle(fake.fileSystem, '/repo', 'main.ts');

    fake.end();

    await expect.poll(() => file.state.type).toBe('unavailable');
  });

  test('logs watch that fails after load', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    const error = new Error('closed');

    fake.end(error);

    await expect.poll(() => logged.mock.calls).toEqual([['Watching main.ts stopped', error]]);
    expect(file.state).toEqual({ type: 'text', content: 'let a;' });
  });

  test('stops watching on dispose', () => {
    const { fake, file } = open('let a;');

    file.dispose();

    expect(fake.cancelled()).toBe(true);
  });

  test('watches path it moved to', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');

    file.move('src/index.ts');

    expect(file.relativePath).toBe('src/index.ts');
    expect(fake.watches).toEqual([['main.ts'], ['src/index.ts']]);
  });

  test('keeps content when moved', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    fake.put('index.ts', 'let a;');

    file.move('index.ts');
    fake.report('main.ts');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(file.state).toEqual({ type: 'text', content: 'let a;' });
  });

  test('ignores report of path it left', async () => {
    const { fake, file } = open();

    file.move('index.ts');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(file.state).toEqual({ type: 'loading' });
    fake.report('index.ts');
    await expect.poll(() => file.state.type).toBe('unavailable');
  });

  test('saves to path it moved to', async () => {
    const { fake, file } = open('let a;');
    await expect.poll(() => file.state.type).toBe('text');
    file.move('index.ts');

    await file.save('let b;', { overwrite: true });

    expect(fake.writes).toEqual([{ relativePath: 'index.ts', content: 'let b;' }]);
  });
});
