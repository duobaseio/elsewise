import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import type { EditorView, Tooltip } from '@codemirror/view';
import type { EditorDiagnostic } from '@elsewise/plugin';
import type { Hover, HoverParams } from 'vscode-languageserver-protocol';
import { COMMANDS } from '@/editor/editor-manager';
import { hoverSources, type ProblemAction, problemActionSources } from '@/editor/hover';
import { APPLY_TOP_FIX, apply, isFix, requestActions, SHOW_CONTEXT_ACTIONS } from '@/editor/lsp/actions';
import { documentation } from '@/editor/lsp/documentation';

/**
 * Returns the client extension that adds the server's documentation for the code under the pointer, and its fixes for
 * the problems there, to the hover.
 */
export function serverHover(): LSPClientExtension {
  return { editorExtension: [hoverSources.of(lookUp), problemActionSources.of(actionsFor)] };
}

// Copied from `@codemirror/lsp-client`'s `lspTooltipSource`.
//
// Shows the code blocks that open the documentation as a highlighted definition above the rest.
async function lookUp(view: EditorView, pos: number): Promise<Tooltip | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.serverCapabilities?.hoverProvider) {
    return null;
  }

  plugin.client.sync();
  const result = await plugin.client
    .request<HoverParams, Hover | null>('textDocument/hover', {
      position: plugin.toPosition(pos),
      textDocument: { uri: plugin.uri },
    })
    .catch(() => null);
  if (result == null) {
    return null;
  }

  const { contents } = result;
  const dom = documentation(
    plugin,
    typeof contents === 'object' && 'kind' in contents
      ? contents
      : {
          kind: 'markdown',
          value: (Array.isArray(contents) ? contents : [contents])
            .map((part) => (typeof part === 'string' ? part : `\`\`\`${part.language}\n${part.value}\n\`\`\``))
            .join('\n\n'),
        },
  );
  if (dom === null) {
    return null;
  }

  dom.className = 'cm-lsp-hover-tooltip';
  return {
    pos: result.range ? plugin.fromPosition(result.range.start) : pos,
    end: result.range ? plugin.fromPosition(result.range.end) : pos,
    above: true,
    create: () => ({ dom }),
  };
}

// Returns the server's top fix for the problem `diagnostic`, and an action that shows the rest at it, or nothing if the
// server has no actions for it.
async function actionsFor(view: EditorView, diagnostic: EditorDiagnostic): Promise<ProblemAction[]> {
  const item = diagnostic.lsp;
  if (item === undefined) {
    return [];
  }

  const { actions, doc } = await requestActions(view, item.range, [item]);
  if (actions.length === 0) {
    return [];
  }

  const fix = actions.find(isFix);
  return [
    ...(fix ? [{ name: fix.title, command: APPLY_TOP_FIX.id, apply: () => void apply(view, fix, doc) }] : []),
    {
      name: 'More actions',
      command: SHOW_CONTEXT_ACTIONS.id,
      // Opens the actions at the problem rather than wherever the cursor is.
      apply: (view, from) => {
        view.dispatch({ selection: { anchor: from } });
        view.focus();
        view.state.facet(COMMANDS)?.run(SHOW_CONTEXT_ACTIONS.id, view);
      },
    },
  ];
}
