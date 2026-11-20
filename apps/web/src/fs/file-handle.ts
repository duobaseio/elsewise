import type { Client } from '@elsewise/transport';
import type { FileSystemService } from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';

/**
 * What an {@link FileHandle} shows:
 * * `loading` until the file has been loaded.
 * * `binary` once it has and the content is not text, with the content on disk as last loaded.
 * * `text` once it has and the content is text, with the content on disk as last loaded or saved.
 * * `unavailable` if the file cannot be read, with why.
 */
export type FileHandleState =
  | { readonly type: 'loading' }
  | { readonly type: 'binary'; readonly content: Uint8Array }
  | { readonly type: 'text'; readonly content: string }
  | { readonly type: 'unavailable'; readonly message: string };

/**
 * A file open in an editor, loaded and saved through the daemon.
 *
 * It watches the file, and loads it again whenever its content on disk changes.
 */
export class FileHandle {
  private readonly watcher: ReturnType<Client<typeof FileSystemService>['watchFiles']>;
  private readonly changeListeners = new Set<() => void>();
  private readonly diskChangeListeners = new Set<() => void>();
  /**
   * The hash of the content on disk, as last loaded or saved.
   */
  private hash: Uint8Array | undefined;
  /**
   * The save in progress, which the watch waits for so that it does not load the file mid-save.
   */
  private saving: Promise<unknown> = Promise.resolve();
  private monotonic = 0;
  private bom = false;
  private currentState: FileHandleState = { type: 'loading' };
  private currentDirty = false;
  private disposed = false;

  constructor(
    private readonly fs: Client<typeof FileSystemService>,
    readonly root: string,
    readonly relativePath: string,
  ) {
    this.watcher = fs.watchFiles();
    void this.watcher.send({ root, relativePaths: [relativePath] }).catch(() => {
      // `listen` reports the stream's failure.
    });
    void this.listen();
  }

  private async listen(): Promise<void> {
    let failure = new Error('The file is no longer watched.');
    try {
      for await (const response of this.watcher.responses) {
        await this.saving;
        if (response.state.case === 'content') {
          if (!sameBytes(response.state.value.hash, this.hash)) {
            await this.load().catch((error: Error) => {
              if (this.currentState.type === 'loading') {
                this.currentState = { type: 'unavailable', message: error.message };
                this.notify();
              } else {
                console.error(`Reading ${this.relativePath} failed`, error);
              }
            });
          }
        } else if (this.currentState.type === 'loading') {
          // TODO: Close the panel of a file that is deleted after it was loaded, unless it has unsaved changes.
          this.currentState = { type: 'unavailable', message: 'The file cannot be read.' };
          this.notify();
        }
      }
    } catch (error) {
      failure = error as Error;
    }

    if (this.disposed) {
      return;
    }

    // TODO: Watch the file again once the connection to the daemon reconnects. Until then the file is no longer
    // followed.
    console.error(`Watching ${this.relativePath} stopped`, failure);
    if (this.currentState.type === 'loading') {
      this.currentState = { type: 'unavailable', message: failure.message };
      this.notify();
    }
  }

  private async load(): Promise<void> {
    const monotonic = this.monotonic;
    const { hash, binary, content } = await this.fs.readFile({
      root: this.root,
      relativePath: this.relativePath,
    });
    if (monotonic !== this.monotonic || sameBytes(hash, this.hash)) {
      return;
    }

    const previous = this.currentState.type;
    this.hash = hash;
    this.bom = !binary && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf;
    this.currentState = binary
      ? { type: 'binary', content: content }
      : { type: 'text', content: new TextDecoder().decode(content) };

    if (previous === 'binary' || previous === 'text') {
      for (const listener of this.diskChangeListeners) {
        listener();
      }
    }
    this.notify();
  }

  /**
   * Saves `content` to disk.
   *
   * Throws a FAILED_PRECONDITION error if the file changed on disk since it was last loaded, unless `overwrite` is set.
   */
  save(content: string, { overwrite = false }: { overwrite?: boolean } = {}): Promise<void> {
    // We don't catch errors on save so that callers will receive the rejected promise.
    const save = this.saving.then(async () => {
      const { hash } = await this.fs.writeFile({
        root: this.root,
        relativePath: this.relativePath,
        baseHash: this.hash,
        content: new TextEncoder().encode(this.bom ? `\uFEFF${content}` : content),
        overwrite,
      });
      this.monotonic++;
      this.hash = hash;
      this.currentState = { type: 'text', content };
      this.notify();
    });
    this.saving = save.catch(() => {});
    return save;
  }

  /**
   * Calls `listener` whenever the state or whether it is dirty changes.
   *
   * To stop, call the returned function.
   */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Calls `listener` whenever the content on disk changes after it was first loaded.
   *
   * To stop, call the returned function.
   */
  onDiskChange(listener: () => void): () => void {
    this.diskChangeListeners.add(listener);
    return () => this.diskChangeListeners.delete(listener);
  }

  /**
   * What the file shows.
   */
  get state(): FileHandleState {
    return this.currentState;
  }

  /**
   * Whether the editor has changes that are not saved.
   */
  get dirty(): boolean {
    return this.currentDirty;
  }

  set dirty(dirty: boolean) {
    if (this.currentDirty !== dirty) {
      this.currentDirty = dirty;
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.watcher.cancel();
  }
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  return a !== undefined && b !== undefined && a.length === b.length && a.every((byte, index) => byte === b[index]);
}
