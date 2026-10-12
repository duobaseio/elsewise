import { type LSPClient, type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import type { ChangeSpec } from '@codemirror/state';
import type { ApplyWorkspaceEditResult, Position, TextEdit, WorkspaceEdit } from 'vscode-languageserver-protocol';

/**
 * Returns the extension that tells the server it may send edits with `workspace/applyEdit`, and give file versions in
 * them.
 */
export function serverEdits(): LSPClientExtension {
  return { clientCapabilities: { workspace: { applyEdit: true, workspaceEdit: { documentChanges: true } } } };
}

/**
 * Applies a server's `edit` to the open files, all or nothing.
 */
export function applyWorkspaceEdit(client: LSPClient, edit: WorkspaceEdit): ApplyWorkspaceEditResult {
  const edits = new Map<string, TextEdit[]>(Object.entries(edit.changes ?? {}));
  for (const change of edit.documentChanges ?? []) {
    if (!('textDocument' in change)) {
      // TODO: Create, rename and delete files once the daemon can.
      return { applied: false, failureReason: "Files can't be created, renamed or deleted yet." };
    }

    const { uri, version } = change.textDocument;
    const file = client.workspace.getFile(uri);
    if (file && version !== null && version !== file.version) {
      return { applied: false, failureReason: 'The file has changed since.' };
    }
    edits.set(uri, [...(edits.get(uri) ?? []), ...change.edits.filter((edit): edit is TextEdit => 'newText' in edit)]);
  }

  const updates: [string, ChangeSpec[]][] = [];
  for (const [uri, list] of edits) {
    const view = client.workspace.getFile(uri)?.getView();
    const plugin = view && LSPPlugin.get(view);
    if (!plugin) {
      // TODO: Apply edits to files that aren't open once the daemon can read them.
      return { applied: false, failureReason: "Files that aren't open can't be edited yet." };
    }

    // Clamps a position to its line in the document the server last saw, and maps it through what was typed since.
    const doc = plugin.syncedDoc;
    const at = ({ line, character }: Position) => {
      const { from, length } = doc.line(Math.min(line + 1, doc.lines));
      return plugin.unsyncedChanges.mapPos(from + Math.min(character, length));
    };
    updates.push([
      uri,
      list.map(({ range, newText }) => ({ from: at(range.start), to: at(range.end), insert: newText })),
    ]);
  }

  for (const [uri, changes] of updates) {
    client.workspace.updateFile(uri, { changes, userEvent: 'input.action' });
  }
  return { applied: true };
}
