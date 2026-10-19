import { type Diagnostic, forEachDiagnostic, setDiagnostics, setDiagnosticsEffect } from '@codemirror/lint';
import { type LSPClient, type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { Annotation, EditorState } from '@codemirror/state';
import { type EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { EditorDiagnostic } from '@elsewise/plugin';
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

const SEVERITIES = {
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

const syncer = ViewPlugin.define((view) => new DiagnosticsSyncer(view));

const server = Annotation.define<boolean>();

// TODO: This implementation is ass. We need to implement proper key-ed diagnostic collections when we have the time to.
// Keeps the linters' diagnostics when the server reports and vice versa since setting diagnostics replaces all of them.
const merge = EditorState.transactionExtender.of((tr) => {
  const set = tr.effects.findLast((effect) => effect.is(setDiagnosticsEffect));
  if (!set?.is(setDiagnosticsEffect)) {
    return null;
  }

  const annotated = tr.annotation(server) === true;
  const others: Diagnostic[] = [];
  forEachDiagnostic(tr.startState, (diagnostic: EditorDiagnostic, from, to) => {
    if ((diagnostic.lsp !== undefined) !== annotated) {
      others.push({ ...diagnostic, from: tr.changes.mapPos(from, 1), to: tr.changes.mapPos(to, -1) });
    }
  });
  return others.length === 0 ? null : { effects: setDiagnosticsEffect.of([...set.value, ...others]) };
});

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

        replaceDiagnostics(view, plugin, params.diagnostics);
        return true;
      },
    },
    editorExtension: [syncer, merge],
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

    // TODO: Send the previous result id, so the server can answer "unchanged", once multiple files are supported.
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

      replaceDiagnostics(this.view, plugin, report.items);
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
 * Replaces the editor's diagnostics with the server's `items`.
 */
function replaceDiagnostics(view: EditorView, plugin: LSPPlugin, items: LSPDiagnostic[]): void {
  view.dispatch({
    ...setDiagnostics(
      view.state,
      items.map((item) => convert(plugin, item)),
    ),
    annotations: server.of(true),
  });
}

// Based on `@codemirror/lsp-client`'s `serverDiagnostics`.
function convert(plugin: LSPPlugin, item: LSPDiagnostic): EditorDiagnostic {
  let from = plugin.unsyncedChanges.mapPos(plugin.fromPosition(item.range.start, plugin.syncedDoc));
  let to = plugin.unsyncedChanges.mapPos(plugin.fromPosition(item.range.end, plugin.syncedDoc));
  // Widens a diagnostic at a point, which the linter would mark with a triangle, to the word there, or else a character
  // beside it, or the last one before its empty line.
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
    } else {
      for (let number = line.number - 1; number >= 1; number--) {
        const previous = state.doc.line(number);
        const end = previous.text.trimEnd().length;
        if (end > 0) {
          from = previous.from + end - 1;
          to = from + 1;
          break;
        }
      }
    }
  }

  const { source, severity, tags, code, codeDescription, message } = item;
  return {
    lsp: item,
    from,
    to,
    severity: SEVERITIES[severity ?? DiagnosticSeverity.Error],
    markClass: tags?.map((tag) => TAGS[tag]).join(' ') || 'cm-lintRange-plain',
    source: source,
    code: code,
    codeHref: codeDescription?.href,
    message: typeof message === 'string' ? message : message.value,
    ...(typeof message === 'object' && {
      renderMessage: () => {
        const template = document.createElement('template');
        template.innerHTML = plugin.docToHTML(message);
        return template.content;
      },
    }),
  };
}
