import { type Diagnostic, linter, setDiagnostics } from '@codemirror/lint';
import { type LSPClient, type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { StateEffect, StateField } from '@codemirror/state';
import { type EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import {
  DiagnosticSeverity,
  DiagnosticTag,
  type DocumentDiagnosticParams,
  type DocumentDiagnosticReport,
  type Diagnostic as LSPDiagnostic,
  LSPErrorCodes,
  type PublishDiagnosticsParams,
  type ResponseError,
} from 'vscode-languageserver-protocol';

/**
 * The milliseconds to wait after an edit before asking, matching how long `@codemirror/lsp-client` waits to sync it.
 */
const DELAY = 500;

const TAGS = {
  [DiagnosticTag.Unnecessary]: 'cm-lintRange-unnecessary',
  [DiagnosticTag.Deprecated]: 'cm-lintRange-deprecated',
} as const satisfies Record<DiagnosticTag, string>;

export const SEVERITIES = {
  [DiagnosticSeverity.Error]: 'error',
  [DiagnosticSeverity.Warning]: 'warning',
  [DiagnosticSeverity.Information]: 'info',
  [DiagnosticSeverity.Hint]: 'hint',
} as const satisfies Record<DiagnosticSeverity, Diagnostic['severity']>;

const CANCELLED = new Set<number>([
  LSPErrorCodes.RequestCancelled,
  LSPErrorCodes.ContentModified,
  LSPErrorCodes.ServerCancelled,
]);

/**
 * The server's diagnostics for the editor's document, with their ranges mapped through edits since.
 */
export const problems = StateField.define<readonly { item: LSPDiagnostic; from: number; to: number }[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setProblems)) {
        return effect.value;
      }
    }
    return tr.docChanged
      ? value.map((entry) => ({ ...entry, from: tr.changes.mapPos(entry.from), to: tr.changes.mapPos(entry.to) }))
      : value;
  },
});

const setProblems = StateEffect.define<readonly { item: LSPDiagnostic; from: number; to: number }[]>();

const syncer = ViewPlugin.define((view) => new DiagnosticsSyncer(view));

/**
 * Returns the client extension that shows the server's diagnostics, whether it pushes them or waits to be asked.
 *
 * It replaces `@codemirror/lsp-client`'s `serverDiagnostics`, which only shows pushed ones.
 */
export function serverDiagnostics(): LSPClientExtension {
  const tags = { valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated] };
  return {
    clientCapabilities: {
      textDocument: {
        publishDiagnostics: { versionSupport: true, tagSupport: tags, codeDescriptionSupport: true },
        diagnostic: {
          dynamicRegistration: false,
          tagSupport: tags,
          codeDescriptionSupport: true,
          markupMessageSupport: true,
        },
      },
    },
    notificationHandlers: {
      // Based on `@codemirror/lsp-client`'s `serverDiagnostics`.
      'textDocument/publishDiagnostics': (client, params: PublishDiagnosticsParams) => {
        const file = client.workspace.getFile(params.uri);
        if (!file || (params.version != null && params.version !== file.version)) {
          return false;
        }

        const view = file.getView();
        const plugin = view && LSPPlugin.get(view);
        if (!view || !plugin) {
          return false;
        }

        replaceProblems(view, plugin, params.diagnostics);
        return true;
      },
    },
    // Adds the linter at a higher precedence since a problem would otherwise be shown below the documentation.
    editorExtension: [
      problems,
      syncer,
      // Leaves the problems to `serverHover`, which shows them with their fixes. Returns `null`, since the linter shows
      // `[]` as an empty tooltip.
      linter(null, { tooltipFilter: () => null as unknown as Diagnostic[] }),
    ],
  };
}

/**
 * Asks `client`'s server for the diagnostics of every open file.
 */
export function pullAllDiagnostics(client: LSPClient): void {
  for (const file of client.workspace.files) {
    const view = file.getView();
    if (view !== null) {
      void view.plugin(syncer)?.pull();
    }
  }
}

/**
 * Syncs an editor's document after an edit, so a server pushes its new diagnostics, and asks a server that pulls.
 */
class DiagnosticsSyncer implements PluginValue {
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private pending: DocumentDiagnosticParams | undefined;

  constructor(private readonly view: EditorView) {
    void this.pull();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        LSPPlugin.get(this.view)?.client.sync();
        void this.pull();
      }, DELAY);
    }
  }

  /**
   * Asks the server for the diagnostics, cancelling the previous request, unless it pushes them instead.
   */
  async pull(): Promise<void> {
    const plugin = LSPPlugin.get(this.view);
    const file = plugin?.client.workspace.getFile(plugin.uri);
    if (!plugin?.client.serverCapabilities?.diagnosticProvider || file == null) {
      return;
    }

    plugin.client.sync();
    if (this.pending !== undefined) {
      plugin.client.cancelRequest(this.pending);
    }

    const parameters: DocumentDiagnosticParams = { textDocument: { uri: plugin.uri } };
    const version = file.version;
    this.pending = parameters;
    try {
      const report = await plugin.client.request<DocumentDiagnosticParams, DocumentDiagnosticReport>(
        'textDocument/diagnostic',
        parameters,
      );

      if (this.pending !== parameters) {
        return;
      }
      this.pending = undefined;

      // New file version will sync & pull instead.
      if (report.kind !== 'full' || file.version !== version) {
        return;
      }

      replaceProblems(this.view, plugin, report.items);
    } catch (error) {
      if (this.pending === parameters) {
        this.pending = undefined;
      }

      const { code } = error as ResponseError<unknown>;
      if (!CANCELLED.has(code)) {
        console.warn(`Pulling diagnostics for ${parameters.textDocument.uri} failed`, error);
      }
    }
  }

  destroy(): void {
    clearTimeout(this.timeout);
    this.pending = undefined;
  }
}

/**
 * Replaces the editor's problems with the server's diagnostics `items`.
 */
function replaceProblems(view: EditorView, plugin: LSPPlugin, items: LSPDiagnostic[]): void {
  const diagnostics = items.map((item) => convert(plugin, item));
  view.dispatch(setDiagnostics(view.state, diagnostics), {
    effects: setProblems.of(items.map((item, i) => ({ item, from: diagnostics[i].from, to: diagnostics[i].to }))),
  });
}

// Based on `@codemirror/lsp-client`'s `serverDiagnostics`.
//
// Widens a problem at a point, and tags it as unnecessary or deprecated.
function convert(plugin: LSPPlugin, item: LSPDiagnostic): Diagnostic {
  let from = plugin.unsyncedChanges.mapPos(plugin.fromPosition(item.range.start, plugin.syncedDoc));
  let to = plugin.unsyncedChanges.mapPos(plugin.fromPosition(item.range.end, plugin.syncedDoc));
  // Widens a problem at a point, which the linter would mark with a triangle, to the word there or else a character
  // beside it.
  if (from === to) {
    const { state } = plugin.view;
    const word = state.wordAt(from);
    const line = state.doc.lineAt(from);
    if (word) {
      ({ from, to } = word);
    } else if (to < line.to) {
      to += 1;
    } else if (from > line.from) {
      from -= 1;
    }
  }

  return {
    from,
    to,
    severity: SEVERITIES[item.severity ?? DiagnosticSeverity.Error],
    markClass: item.tags?.map((tag) => TAGS[tag]).join(' ') || 'cm-lintRange-plain',
    message: typeof item.message === 'string' ? item.message : item.message.value,
  };
}
