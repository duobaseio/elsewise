import fs from 'node:fs/promises';
import path from 'node:path';
import { Code, TransportError } from '@elsewise/transport';
import type { DirectoryWatcher } from '../directory-watcher';
import { errnoOf } from './error';
import { parseProtocolPath, toNativeRoot } from './path';

/** A watched path's state. */
export interface Snapshot<S> {
  /**
   * Identifies the state.
   *
   * Used internally to perform comparisons.
   */
  key: string;

  /**
   * The state reported for the path.
   *
   * Used to store rich state objects for the client.
   */
  state: S;
}

/** Represents a request with the paths a stream watches. */
export interface WatchRequest {
  /** The protocol root the paths are relative to. Subsequent requests may leave it empty. */
  root: string;

  /** The relative protocol paths to watch. */
  relativePaths: string[];
}

/** Represents the various options for `watchPaths`. */
export interface WatchOptions<S> {
  /** The `DirectoryWatcher` used. */
  watcher: DirectoryWatcher;

  /** How often every watched path is polled in milliseconds. */
  pollIntervalMs: number;

  /** How long notified changes are debounced in milliseconds. */
  debounceMs: number;

  /**
   * Whether the state covers the entry's direct children.
   *
   * Typically enabled for a directory. For example:
   * - The watcher may report changes on: ['src/c.ts'].
   * - Enabling this option will ensure the `c.ts` is detected as a change although its parent `src` has not changed.
   * - This only affects the direct children and not any nested directories/files.
   */
  includesChildren: boolean;

  /** Takes a snapshot of a given entry. */
  snapshot(absoluteNativePath: string): Promise<Snapshot<S>>;
}

/** A watched path state. */
interface Tracked {
  /** The native absolute path. */
  absoluteNativePath: string;

  /** The entry's `stat` when its state was last read (e.g. `dev:ino:size:mtimeNs:ctimeNs` or `!<errno>`). */
  stat?: string;

  /** The key of the snapshot last reported. */
  key?: string;

  /**
   * Whether a check is reading the state.
   *
   * A check arriving while `running` is `true` sets `stale`. If `stale` is set, the check has to reread the state as
   * the information read could be outdated.
   */
  running: boolean;

  /** Whether the running check reads again once it finishes. */
  stale: boolean;
}

/** Watches the state of each path. */
export async function* watchPaths<S>(
  requests: AsyncIterable<WatchRequest>,
  signal: AbortSignal,
  options: WatchOptions<S>,
): AsyncGenerator<{ relativePath: string; state: S }> {
  const session = new Session(options);
  const end = () => session.end();
  signal.addEventListener('abort', end, { once: true });
  try {
    if (!signal.aborted) {
      session.consume(requests);
      yield* session.states();
    }
  } finally {
    signal.removeEventListener('abort', end);
    session.end();
  }
}

class Session<S> {
  readonly #options: WatchOptions<S>;
  readonly #tracked = new Map<string, Tracked>(); // Relative protocol path -> Tracked
  #nativeRoot: string | undefined;

  #watch: { ready: Promise<void>; close(): void } | undefined;
  #pollTimer: NodeJS.Timeout | undefined;

  /** The watched paths that notified changes touched and that have not been read again yet. */
  readonly #debounceBuffer = new Set<string>(); // Relative protocol paths.
  #debounce: NodeJS.Timeout | undefined;

  /** The states waiting to be sent, holding only the latest of each path. */
  readonly #outbox = new Map<string, S>(); // Relative protocol path -> state
  #outboxWake: (() => void) | undefined;

  #ended = false;
  #failure: unknown;

  constructor(options: WatchOptions<S>) {
    this.#options = options;
  }

  /** Applies each request. Ends the session when the iterable closes. */
  consume(requests: AsyncIterable<WatchRequest>): void {
    void (async () => {
      try {
        for await (const request of requests) {
          if (this.#ended) {
            break;
          }
          this.#applyRequest(request);
        }
      } catch (error) {
        this.#failure ??= error;
      }
      this.end();
    })();
  }

  /** Yields each state to send until the session ends. */
  async *states(): AsyncGenerator<{ relativePath: string; state: S }> {
    while (!this.#ended) {
      const [next] = this.#outbox;
      if (next) {
        const [relativeProtocolPath, state] = next;
        this.#outbox.delete(relativeProtocolPath);
        yield { relativePath: relativeProtocolPath, state };
        continue;
      }
      await new Promise<void>((resolve) => {
        this.#outboxWake = resolve;
      });
    }
    if (this.#failure !== undefined) {
      throw this.#failure;
    }
  }

  /** Stops watching. */
  end(): void {
    this.#tracked.clear();
    this.#watch?.close();
    this.#watch = undefined;
    clearInterval(this.#pollTimer);
    clearTimeout(this.#debounce);
    this.#outboxWake?.();
    this.#ended = true;
  }

  #applyRequest(request: WatchRequest): void {
    let nativeRoot = this.#nativeRoot;
    if (nativeRoot === undefined) {
      nativeRoot = toNativeRoot(request.root);
      this.#nativeRoot = nativeRoot;
      this.#watch = this.#options.watcher.watch(nativeRoot, (relativeProtocolPaths) =>
        this.#onNotified(relativeProtocolPaths),
      );
      this.#pollTimer = setInterval(() => this.#pollAll(), this.#options.pollIntervalMs);
    } else if (request.root !== '' && toNativeRoot(request.root) !== nativeRoot) {
      throw new TransportError(Code.INVALID_ARGUMENT, 'a stream cannot change its root');
    }

    const requested = new Map<string, string>(); // Relative protocol path -> absolute native path
    for (const relativeProtocolPath of request.relativePaths) {
      requested.set(relativeProtocolPath, path.join(nativeRoot, ...parseProtocolPath(relativeProtocolPath)));
    }

    // Checks if any existing paths has been removed.
    for (const relativeProtocolPath of this.#tracked.keys()) {
      if (!requested.has(relativeProtocolPath)) {
        this.#tracked.delete(relativeProtocolPath);
        this.#outbox.delete(relativeProtocolPath);
        this.#debounceBuffer.delete(relativeProtocolPath);
      }
    }

    // Adds untracked paths and rechecks all requested paths.
    for (const [relativeProtocolPath, absoluteNativePath] of requested) {
      if (!this.#tracked.has(relativeProtocolPath)) {
        this.#tracked.set(relativeProtocolPath, { absoluteNativePath, running: false, stale: false });
      }

      void this.#watch?.ready.then(() => this.#check(relativeProtocolPath, true));
    }
  }

  #onNotified(relativeProtocolPaths: string[]): void {
    const exact = new Set(relativeProtocolPaths);
    const parents = new Set(this.#options.includesChildren ? relativeProtocolPaths.map(parentOf) : []);
    for (const relativeProtocolPath of this.#tracked.keys()) {
      if (parents.has(relativeProtocolPath) || isAtOrBelow(relativeProtocolPath, exact)) {
        this.#debounceBuffer.add(relativeProtocolPath);
      }
    }
    if (this.#debounceBuffer.size > 0) {
      this.#debounce ??= setTimeout(() => this.#flushDebounceBuffer(), this.#options.debounceMs);
    }
  }

  #flushDebounceBuffer(): void {
    this.#debounce = undefined;
    const buffer = [...this.#debounceBuffer];
    this.#debounceBuffer.clear();
    for (const relativeProtocolPath of buffer) {
      void this.#check(relativeProtocolPath, true);
    }
  }

  #pollAll(): void {
    for (const relativeProtocolPath of this.#tracked.keys()) {
      void this.#check(relativeProtocolPath, false);
    }
  }

  /** Reads a path's state and queues it if it differs from the previous state reported. */
  async #check(relativeProtocolPath: string, force: boolean): Promise<void> {
    const tracked = this.#tracked.get(relativeProtocolPath);
    if (!tracked) {
      return;
    }

    if (tracked.running) {
      tracked.stale ||= force;
      return;
    }
    tracked.running = true;

    try {
      let innerForce = force;
      do {
        innerForce ||= tracked.stale;
        tracked.stale = false;
        const stat = await statOf(tracked.absoluteNativePath);
        if (innerForce || stat !== tracked.stat) {
          const snapshot = await this.#options.snapshot(tracked.absoluteNativePath);

          // Ensures that `tracked` isn't changed by `#applyRequest()` or `end()`.
          if (this.#tracked.get(relativeProtocolPath) !== tracked) {
            return;
          }

          tracked.stat = stat;
          if (snapshot.key !== tracked.key) {
            tracked.key = snapshot.key;
            this.#outbox.set(relativeProtocolPath, snapshot.state);
            this.#outboxWake?.();
          }
        }
        innerForce = false;
      } while (tracked.stale);
    } catch (error) {
      this.#failure ??= error;
      this.end();
    } finally {
      tracked.running = false;
    }
  }
}

/** Returns the entry's `stat` (e.g. `dev:ino:size:mtimeNs:ctimeNs` or `!<errno>`). */
async function statOf(absoluteNativePath: string): Promise<string> {
  try {
    const stats = await fs.stat(absoluteNativePath, { bigint: true });
    return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`;
  } catch (error) {
    return `!${errnoOf(error)}`;
  }
}

/** Returns the path of the directory holding the entry. */
function parentOf(relativeProtocolPath: string): string {
  const end = relativeProtocolPath.lastIndexOf('/');
  return end === -1 ? '' : relativeProtocolPath.slice(0, end);
}

/** Returns whether the entry lies below (or is equal) to any `relativeProtocolPaths`. */
function isAtOrBelow(relativeProtocolPath: string, relativeProtocolPaths: Set<string>): boolean {
  let current = relativeProtocolPath;
  while (true) {
    if (relativeProtocolPaths.has(current)) {
      return true;
    }
    if (current === '') {
      return false;
    }
    current = parentOf(current);
  }
}
