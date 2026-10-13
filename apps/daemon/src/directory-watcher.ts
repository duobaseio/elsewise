import fs from 'node:fs/promises';
import path from 'node:path';
import watcher from '@parcel/watcher';
import { toProtocolPath } from './fs/path';

export interface DirectoryWatcherOptions {
  /**
   * Globs over the paths relative to a root, or patterns matched against the native paths, whose changes are not
   * notified.
   *
   * For example: `node_modules/**`.
   */
  ignore: (string | RegExp)[];
}

/** Receives the `/`-separated relative paths of the entries that have changed. */
export type ChangeListener = (relativeProtocolPaths: string[]) => void;

/** How a root is being watched. */
export interface RootState {
  /** The root's absolute path. */
  root: string;

  /** Whether changes are notified by the operating system or polled. */
  mode: 'notify' | 'poll';

  /** Why is it in the polled mode. */
  reason?: 'watch-limit' | 'other';
}

/**
 * Manages the watching of root directories.
 *
 * Repeated subscriptions to the same directory will share the same OS notifiers.
 */
export class DirectoryWatcher {
  readonly #ignore: (string | RegExp)[];
  readonly #roots = new Map<string, Root>();
  readonly #observers = new Set<() => void>();

  constructor(options: DirectoryWatcherOptions) {
    this.#ignore = options.ignore;
  }

  /** Watches a root until the returned object is closed. */
  watch(root: string, listener: ChangeListener): { close(): void } {
    const entry = this.#roots.get(root) ?? this.#open(root);
    const remove = entry.add(listener);

    return {
      close: () => {
        if (remove()) {
          this.#roots.delete(root);
          entry.close();
          if (entry.state) {
            this.#announce();
          }
        }
      },
    };
  }

  /** Returns every root being watched. */
  roots(): RootState[] {
    return [...this.#roots.values()].flatMap(({ state }) => (state ? [state] : []));
  }

  /** Calls the observer whenever `roots()` changes until the returned object is closed. */
  observeRoots(observer: () => void): { close(): void } {
    this.#observers.add(observer);
    return {
      close: () => {
        this.#observers.delete(observer);
      },
    };
  }

  #open(root: string): Root {
    const entry = new Root(root, this.#ignore, () => this.#announce());
    this.#roots.set(root, entry);
    return entry;
  }

  #announce(): void {
    for (const observer of this.#observers) {
      observer();
    }
  }
}

/** A watched root. */
class Root {
  readonly #root: string;
  readonly #ignore: (string | RegExp)[];
  readonly #onStateChange: () => void;
  readonly #listeners = new Set<ChangeListener>();
  readonly #ready: Promise<void>; // Settles once the root's mode is known.
  #state?: RootState;
  #subscription?: watcher.AsyncSubscription;
  #closed = false;

  /** Starts watching the root, calling `onChange` whenever `state` changes before `close()`. */
  constructor(root: string, ignore: (string | RegExp)[], onStateChange: () => void) {
    this.#root = root;
    this.#ignore = ignore;
    this.#onStateChange = onStateChange;
    this.#ready = this.#subscribe();
  }

  /** The state of this root. */
  get state(): RootState | undefined {
    return this.#state;
  }

  /** Adds a listener. Returns a function that removes the listener and returns whether it was the last. */
  add(listener: ChangeListener): () => boolean {
    // Prevents the set from deduplicating.
    const registered: ChangeListener = (relativeProtocolPaths) => listener(relativeProtocolPaths);
    this.#listeners.add(registered);
    return () => this.#listeners.delete(registered) && this.#listeners.size === 0;
  }

  /** Stop watching the root. */
  close(): void {
    this.#closed = true;
    this.#ready
      .then(() => this.#subscription?.unsubscribe())
      .catch((error) => console.error(`Cannot stop watching ${this.#root}.`, error));
  }

  async #subscribe(): Promise<void> {
    try {
      const resolved = await fs.realpath(this.#root); // Resolve symbolic links.
      this.#subscription = await watcher.subscribe(
        resolved,
        (error, events) => {
          if (error) {
            // Deferred until subscribing has settled, so the subscription is in place for `#degrade` to drop.
            this.#ready.then(() => this.#degrade(error));
            return;
          }
          const relativeProtocolPaths = events.flatMap((event) => relativeTo(resolved, event.path));
          for (const listener of this.#listeners) {
            listener(relativeProtocolPaths);
          }
        },
        { ignore: this.#ignore },
      );
      this.#update({ root: this.#root, mode: 'notify' });
    } catch (error) {
      this.#degrade(error);
    }
  }

  /** Marks the root as polled after its subscription failed, dropping the subscription if it was established. */
  #degrade(error: unknown): void {
    if (this.#closed) {
      return;
    }
    const subscription = this.#subscription;
    this.#subscription = undefined;
    console.error(`Cannot watch ${this.#root} for changes, so it is polled.`, error);
    subscription?.unsubscribe().catch((error) => console.error(`Cannot stop watching ${this.#root}.`, error));
    this.#update({ root: this.#root, mode: 'poll', reason: isWatchLimit(error) ? 'watch-limit' : 'other' });
  }

  #update(state: RootState): void {
    this.#state = state;
    if (!this.#closed) {
      this.#onStateChange();
    }
  }
}

/** Returns the `/`-separated path or nothing for an entry outside the root. */
function relativeTo(root: string, absoluteNativePath: string): string[] {
  const relativeNativePath = path.relative(root, absoluteNativePath);
  if (
    relativeNativePath === '..' ||
    relativeNativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeNativePath)
  ) {
    return [];
  }
  return [toProtocolPath(relativeNativePath)];
}

/** Returns whether subscribing failed for running out of notifiers on the OS. */
function isWatchLimit(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as NodeJS.ErrnoException).code === 'ENOSPC' || error.message.includes('No space left on device'))
  );
}
