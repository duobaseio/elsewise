import { type Extension, Facet, type Text, Transaction } from '@codemirror/state';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { DEFAULT_COMMAND_GROUPS, DEFAULT_COMMANDS, DEFAULT_KEYS, type EditorCommand } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import type { FileHandle } from '@/fs/file-handle';

const EDITOR_FILE_HANDLE = Facet.define<FileHandle, FileHandle | null>({
  combine: (values) => values[0] ?? null,
});

/**
 * Lets the view edit `file`. Keeps whether the view has unsaved changes on the file, and applies the file's changes on
 * disk while it has none.
 */
export function editorFile(file: FileHandle): Extension {
  return [EDITOR_FILE_HANDLE.of(file), ViewPlugin.define((view) => new FileHandlePlugin(view, file))];
}

export const EDITOR_SAVE: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.file.save,
  group: DEFAULT_COMMAND_GROUPS.editor.edit,
  label: 'Save',
  defaultKeys: DEFAULT_KEYS.editor.file.save,
  enabled: (_, view) => view.state.facet(EDITOR_FILE_HANDLE) !== null,
  run(_, view) {
    const file = view.state.facet(EDITOR_FILE_HANDLE);
    if (file === null) {
      return false;
    }

    // Lines are joined with the view's line separator, which they were split by, so the file's line endings are kept.
    const code = view.state.sliceDoc();
    const log = (error: Error) =>
      toast.add({ type: 'error', title: `Saving ${file.relativePath} failed`, description: error.message });

    file.save(code).catch((error: Error) => {
      if (error instanceof TransportError && error.code === Code.FAILED_PRECONDITION) {
        // TODO: Close this toast when the editor is destroyed, once the editor's plugin shows it. Until then it
        // outlives the editor, and Overwrite saves the closed editor's document.
        toast.add({
          type: 'warning',
          title: `${file.relativePath} changed on disk`,
          description: 'Overwrite it with your changes, or reload it and lose them.',
          actionProps: {
            children: 'Overwrite',
            onClick: () => file.save(view.state.sliceDoc(), { overwrite: true }).catch(log),
          },
        });
      } else {
        log(error);
      }
    });
    return true;
  },
};

class FileHandlePlugin {
  private readonly disposables: (() => void)[];
  private disk: { readonly code: string; readonly doc: Text };
  private toastId: string | undefined;

  constructor(
    private readonly view: EditorView,
    private readonly file: FileHandle,
  ) {
    const code = file.state.type === 'text' ? file.state.content : '';
    this.disk = { code, doc: this.view.state.toText(code) };
    this.disposables = [file.onChange(() => this.refresh()), file.onDiskChange(() => this.reload())];
    this.markDirty();
  }

  private refresh(): void {
    if (this.file.state.type === 'text' && this.file.state.content !== this.disk.code) {
      const code = this.file.state.content;
      this.disk = { code, doc: this.view.state.toText(code) };
      this.markDirty();
    }
  }

  private reload(): void {
    if (this.file.state.type !== 'text') {
      return;
    }

    const clean = this.view.state.doc.eq(this.disk.doc);
    const code = this.file.state.content;
    this.disk = { code, doc: this.view.state.toText(code) };
    if (clean) {
      this.replace(this.disk.doc);
      return;
    }

    this.markDirty();
    // TODO: This UX can be improved.
    if (this.toastId !== undefined) {
      toast.close(this.toastId);
    }
    this.toastId = toast.add({
      type: 'warning',
      title: `${this.file.relativePath} changed on disk`,
      description: 'Your unsaved changes are kept.',
      actionProps: { children: 'Reload', onClick: () => this.replace(this.disk.doc) },
    });
  }

  // Replaces the document with `doc`, changing only what differs so that the selection and scroll stay where they are.
  private replace(doc: Text): void {
    const current = this.view.state.doc.toString();
    const next = doc.toString();
    let start = 0;
    while (start < current.length && start < next.length && current[start] === next[start]) {
      start++;
    }
    let end = 0;
    while (
      end < current.length - start &&
      end < next.length - start &&
      current[current.length - 1 - end] === next[next.length - 1 - end]
    ) {
      end++;
    }

    // Avoid selections inside UTF-16 surrogate pairs.
    if (start > 0 && /[\uD800-\uDBFF]/.test(current[start - 1] ?? '')) {
      start--;
    }
    if (end > 0 && /[\uDC00-\uDFFF]/.test(current[current.length - end] ?? '')) {
      end--;
    }

    this.view.dispatch({
      changes: { from: start, to: current.length - end, insert: doc.slice(start, next.length - end) },
      annotations: Transaction.addToHistory.of(false),
    });
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.markDirty();
    }
  }

  destroy(): void {
    for (const dispose of this.disposables) {
      dispose();
    }
    if (this.toastId !== undefined) {
      toast.close(this.toastId);
    }
  }

  private markDirty(): void {
    this.file.dirty = !this.view.state.doc.eq(this.disk.doc);
  }
}
