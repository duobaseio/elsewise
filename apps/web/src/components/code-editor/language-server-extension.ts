import type { Extension } from '@codemirror/state';
import { useMemo } from 'react';
import { useLanguageServer, useLanguageServers } from '@/language-servers/language-servers';

/**
 * Returns the CodeMirror extension that connects the document at `path` to the language server for `language` in the
 * worktree at `root`.
 *
 * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
 */
export function useLanguageServerExtension(
  root: URL | undefined,
  language: string | undefined,
  path: string,
): Extension {
  const servers = useLanguageServers();
  const server = useLanguageServer(language);

  // Uses href rather than root since a caller's new URL for the same root would otherwise reconnect the document.
  const href = root?.href;
  return useMemo(() => {
    if (href === undefined || language === undefined || server === undefined) {
      return [];
    }

    return servers.connect(new URL(href), language, new URL(path, href)) ?? [];
  }, [servers, server, href, language, path]);
}
