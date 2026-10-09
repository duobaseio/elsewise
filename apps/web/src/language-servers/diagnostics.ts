import { type Diagnostic, linter, setDiagnostics } from '@codemirror/lint';
import { type LSPClient, type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { Prec } from '@codemirror/state';
import { type EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import {
  DiagnosticSeverity,
  DiagnosticTag,
  type DocumentDiagnosticParams,
  type DocumentDiagnosticReport,
  LSPErrorCodes,
  type ResponseError,
} from 'vscode-languageserver-protocol';
import { highlightClick } from '@/language-servers/highlights';

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

const puller = ViewPlugin.define((view) => new DiagnosticsPuller(view));

/**
 * Returns the client extension that asks the server for diagnostics, instead of waiting for it to push them.
 */
export function pullDiagnostics(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        diagnostic: {
          dynamicRegistration: false,
          tagSupport: { valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated] },
          codeDescriptionSupport: true,
          markupMessageSupport: true,
        },
      },
    },
    // Adds the linter at a higher precedence since a problem would otherwise be shown below the documentation.
    editorExtension: [
      puller,
      Prec.high(
        linter(null, {
          // Hides the problems while a click highlights usages, as the hover does. Returns `null`, since the linter shows
          // `[]` as an empty tooltip.
          tooltipFilter: (diagnostics, state) =>
            state.field(highlightClick, false) ? (null as unknown as Diagnostic[]) : [...diagnostics],
        }),
      ),
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
      void view.plugin(puller)?.pull();
    }
  }
}

/**
 * Asks the server for an editor's diagnostics.
 */
class DiagnosticsPuller implements PluginValue {
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private pending: DocumentDiagnosticParams | undefined;

  constructor(private readonly view: EditorView) {
    void this.pull();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => void this.pull(), DELAY);
    }
  }

  /**
   * Asks the server for the diagnostics, cancelling the previous request.
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

      // Based on `@codemirror/lsp-client`'s `serverDiagnostics`, which waits for the server to push them.
      this.view.dispatch(
        setDiagnostics(
          this.view.state,
          report.items.map((item) => ({
            from: plugin.unsyncedChanges.mapPos(plugin.fromPosition(item.range.start, plugin.syncedDoc)),
            to: plugin.unsyncedChanges.mapPos(plugin.fromPosition(item.range.end, plugin.syncedDoc)),
            severity: SEVERITIES[item.severity ?? DiagnosticSeverity.Error],
            markClass: item.tags?.map((tag) => TAGS[tag]).join(' ') || undefined,
            message: typeof item.message === 'string' ? item.message : item.message.value,
            renderMessage: () => {
              const result = document.createDocumentFragment();
              const message = result.appendChild(document.createElement('div'));
              message.className = 'cm-diagnosticMessage';
              if (typeof item.message === 'string') {
                // Plain messages still quote code in backticks, e.g. "cannot find value `x` in this scope".
                for (const [i, part] of item.message.split(/`([^`]+)`/).entries()) {
                  if (i % 2 === 0) {
                    message.append(part);
                  } else {
                    message.appendChild(document.createElement('code')).textContent = part;
                  }
                }
              } else {
                message.innerHTML = plugin.docToHTML(item.message);
              }

              if (item.source !== undefined || item.code !== undefined) {
                const meta = result.appendChild(document.createElement('div'));
                meta.className = 'cm-diagnosticMeta';
                if (item.source !== undefined) {
                  meta.append(item.source);
                }
                if (item.code !== undefined) {
                  if (item.source !== undefined) {
                    meta.append(' · ');
                  }
                  // Links only to the web, since the server can send any URI.
                  const href = item.codeDescription?.href;
                  const code = meta.appendChild(
                    href !== undefined && /^https?:/i.test(href)
                      ? Object.assign(document.createElement('a'), { href })
                      : document.createElement('span'),
                  );
                  code.textContent = String(item.code);
                }
              }

              return result;
            },
          })),
        ),
      );
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
