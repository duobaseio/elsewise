import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { EditorState } from '@codemirror/state';
import type { EditorView, Tooltip } from '@codemirror/view';
import { DEFAULT_HOVER_SECTIONS, type EditorHoverSource } from '@elsewise/plugin';
import type { Hover, HoverParams } from 'vscode-languageserver-protocol';
import { documentation } from '@/editor/lsp/documentation';

const DOCUMENTATION: EditorHoverSource = { source: lookUp, order: DEFAULT_HOVER_SECTIONS.documentation };

/**
 * Returns the client extension that adds the server's documentation for the code under the pointer to the hover.
 */
export function serverHover(): LSPClientExtension {
  return { editorExtension: EditorState.languageData.of(() => [{ hover: DOCUMENTATION }]) };
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
