import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DiffState } from '@/editor/diff';
import { useEditorManager } from '@/editor/editor-manager';
import type { EditorSession } from '@/editor/layouts/layout';
import { SplitLayout } from '@/editor/layouts/split-layout';
import { UnifiedLayout } from '@/editor/layouts/unified-layout';

export interface EditorProps {
  /**
   * The root of the worktree that the file is in, ending in `/`.
   */
  root?: URL;
  /**
   * The file's path, relative to the worktree's root, e.g. `src/main.ts`.
   */
  relativePath: string;
  code: string;
  /**
   * Which source the file is diffed against, and in which layout.
   */
  diff: DiffState;
}

/**
 * A code editor.
 */
export function Editor({ root, relativePath, code, diff }: EditorProps) {
  const subscribe = useCallback((listener: () => void) => diff.subscribe(listener), [diff]);
  const source = useSyncExternalStore(subscribe, () => diff.source);
  const layout = useSyncExternalStore(subscribe, () => diff.layout);
  const sources = useEditorManager((editor) => editor.diffs.sources);

  // The base of the source once it has been fetched, or the previous source's while it is fetched, so that the layout
  // stays the same in the meantime.
  const [base, setBase] = useState<string | null>(null);
  const session = useRef<EditorSession>(null);

  // Fetches the base of the source. Keeps a base that arrives late from being applied to another source.
  useEffect(() => {
    const found = source === null ? undefined : sources.find((other) => other.id === source);
    if (found === undefined) {
      setBase(null);
      return;
    }

    let live = true;
    found.base().then(
      (text) => {
        if (live) {
          // A null base means the file did not exist in the source, so all of it is added.
          setBase(text ?? '');
        }
      },
      (error) => {
        console.error(`Diff source ${source} failed`, error);
        if (live) {
          setBase(null);
        }
      },
    );

    return () => {
      live = false;
    };
  }, [source, sources]);

  const fetched = source === null ? null : base;
  return fetched !== null && layout === 'split' ? (
    <SplitLayout
      relativePath={relativePath}
      base={{ source: { type: 'blob' }, code: fetched }}
      target={{ source: { type: 'workingTree', root }, code }}
      extensions={diff.extension}
      session={session}
    />
  ) : (
    <UnifiedLayout
      source={{ type: 'workingTree', root }}
      relativePath={relativePath}
      code={code}
      base={fetched}
      extensions={diff.extension}
      session={session}
    />
  );
}
