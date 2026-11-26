import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { DEFAULT_COMMANDS } from '@elsewise/frontend-plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { editorFile } from '@/editor/file';
import { FileHandle } from '@/fs/file-handle';
import { builtInCommands, commandsExtension } from '../../test/commands';
import { fakeFileSystem } from '../../test/fake-file-system';

const SAVE = DEFAULT_COMMANDS.editor.file.save;

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
  vi.restoreAllMocks();
});

// Opens `main.ts` with `content` in an editor that separates lines by `lineSeparator`, once it has been read.
async function open(content: string, lineSeparator = '\n') {
  const fake = fakeFileSystem();
  fake.put('main.ts', content);
  const file = new FileHandle(fake.fileSystem, '/repo', 'main.ts');
  fake.report('main.ts');
  await expect.poll(() => file.state.type).toBe('text');

  const commands = builtInCommands();
  const view = new EditorView({
    state: EditorState.create({
      doc: content,
      extensions: [EditorState.lineSeparator.of(lineSeparator), editorFile(file), commandsExtension(commands)],
    }),
    parent: document.body,
  });
  views.push(view);
  return { fake, file, view, commands };
}

describe('editorFile', () => {
  test('opens file of mixed line endings clean', async () => {
    const { file } = await open('let a;\nlet b;\r\nlet c;\r\n', '\r\n');

    expect(file.document).toBeNull();
  });

  test('opens file clean under other line separator', async () => {
    const { file } = await open('let a;\r\nlet b;\r\n', '\n');

    expect(file.document).toBeNull();
  });

  test('applies change on disk to file of mixed line endings', async () => {
    const { fake, view } = await open('let a;\nlet b;\r\nlet c;\r\n', '\r\n');

    fake.put('main.ts', 'let z;\nlet b;\r\nlet c;\r\n');
    fake.report('main.ts');

    await expect.poll(() => view.state.sliceDoc()).toBe('let z;\nlet b;\r\nlet c;\r\n');
  });

  test('marks edit dirty', async () => {
    const { file, view } = await open('let a;\n');

    view.dispatch({ changes: { from: 4, to: 5, insert: 'b' } });

    expect(file.document).not.toBeNull();
  });

  test('clears dirty on undoing edit', async () => {
    const { file, view } = await open('let a;\n');

    view.dispatch({ changes: { from: 4, to: 5, insert: 'b' } });
    view.dispatch({ changes: { from: 4, to: 5, insert: 'a' } });

    expect(file.document).toBeNull();
  });

  test('applies change on disk, keeping caret', async () => {
    const { fake, view } = await open('let a;\nlet b;\n');
    view.dispatch({ selection: EditorSelection.cursor(12) });

    fake.put('main.ts', 'let z;\nlet b;\n');
    fake.report('main.ts');

    await expect.poll(() => view.state.doc.toString()).toBe('let z;\nlet b;\n');
    expect(view.state.selection.main.head).toBe(12);
  });

  test('keeps caret off surrogate pair on change on disk', async () => {
    const { fake, view } = await open('x\u{1F600}abc\n');
    view.dispatch({ selection: EditorSelection.cursor(4) });

    fake.put('main.ts', 'x\u{1F601}zzz\n');
    fake.report('main.ts');

    await expect.poll(() => view.state.doc.toString()).toBe('x\u{1F601}zzz\n');
    expect(view.state.selection.main.head).toBe(1);
  });

  test('keeps edits on change on disk', async () => {
    const { fake, file, view } = await open('let a;\n');
    view.dispatch({ changes: { from: 4, to: 5, insert: 'b' } });

    fake.put('main.ts', 'let z;\n');
    fake.report('main.ts');

    await expect.poll(() => file.state).toEqual({ type: 'text', content: 'let z;\n' });
    expect(view.state.doc.toString()).toBe('let b;\n');
    expect(file.document).not.toBeNull();
  });
});

describe('editorFile text', () => {
  test('gives file text of editor', async () => {
    const { file, view } = await open('let a;\r\nlet b;\r\n', '\r\n');

    view.dispatch({ changes: { from: 4, to: 5, insert: 'z' } });

    expect(file.document?.()).toBe('let z;\r\nlet b;\r\n');
  });

  test('gives file text of editor outside document', async () => {
    const { file, view } = await open('let a;\n');
    view.dispatch({ changes: { from: 4, to: 5, insert: 'z' } });

    view.dom.remove();

    expect(file.document?.()).toBe('let z;\n');
  });

  test('gives file no text while editor has text on disk', async () => {
    const { file, view } = await open('let a;\n');
    view.dispatch({ changes: { from: 4, to: 5, insert: 'z' } });

    view.dispatch({ changes: { from: 4, to: 5, insert: 'a' } });

    expect(file.document).toBeNull();
  });

  test('gives file no text once editor is destroyed', async () => {
    const { file, view } = await open('let a;\n');
    view.dispatch({ changes: { from: 4, to: 5, insert: 'z' } });

    view.destroy();

    expect(file.document).toBeNull();
  });
});

describe('editorFile toasts', () => {
  // Opens `main.ts` with unsaved changes, and changes it on disk.
  async function conflict() {
    const opened = await open('let a;\n');
    const added = vi.spyOn(toast, 'add');
    const closed = vi.spyOn(toast, 'close');
    opened.view.dispatch({ changes: { from: 4, to: 5, insert: 'b' } });
    opened.fake.put('main.ts', 'let y;\n');
    opened.fake.report('main.ts');
    await expect.poll(() => added.mock.results).toHaveLength(1);
    return { ...opened, added, closed };
  }

  test('replaces toast of earlier change on disk', async () => {
    const { fake, added, closed } = await conflict();

    fake.put('main.ts', 'let z;\n');
    fake.report('main.ts');

    await expect.poll(() => added.mock.results).toHaveLength(2);
    expect(closed).toHaveBeenCalledExactlyOnceWith(added.mock.results[0]?.value);
  });

  test('closes toast when editor is destroyed', async () => {
    const { view, added, closed } = await conflict();

    view.destroy();

    expect(closed).toHaveBeenCalledExactlyOnceWith(added.mock.results[0]?.value);
  });
});

describe('EDITOR_SAVE', () => {
  test('overwrites with document as it is when overwriting', async () => {
    const { fake, view, commands } = await open('let a;\n');
    const added = vi.spyOn(toast, 'add');
    view.dispatch({ changes: { from: 4, to: 5, insert: 'b' } });
    fake.put('main.ts', 'let z;\n');
    commands.run(SAVE, view);
    await expect.poll(() => added.mock.calls).toHaveLength(1);

    view.dispatch({ changes: { from: 4, to: 5, insert: 'c' } });
    added.mock.calls[0]?.[0].actionProps?.onClick?.({} as never);

    await expect.poll(() => fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let c;\n' }]);
  });

  test('writes document', async () => {
    const { fake, file, view, commands } = await open('let a;\n');
    view.dispatch({ changes: { from: 4, to: 5, insert: 'b' } });

    commands.run(SAVE, view);

    await expect.poll(() => fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let b;\n' }]);
    expect(file.document).toBeNull();
  });

  test('writes with file line separator', async () => {
    const fake = fakeFileSystem();
    fake.put('main.ts', 'let a;\r\n');
    const file = new FileHandle(fake.fileSystem, '/repo', 'main.ts');
    fake.report('main.ts');
    await expect.poll(() => file.state.type).toBe('text');
    const commands = builtInCommands();
    const view = new EditorView({
      state: EditorState.create({
        doc: 'let a;\r\n',
        extensions: [EditorState.lineSeparator.of('\r\n'), editorFile(file), commandsExtension(commands)],
      }),
      parent: document.body,
    });
    views.push(view);

    commands.run(SAVE, view);

    await expect.poll(() => fake.writes).toEqual([{ relativePath: 'main.ts', content: 'let a;\r\n' }]);
  });
});
