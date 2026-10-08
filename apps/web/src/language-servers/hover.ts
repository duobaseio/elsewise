import { LSPPlugin } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { closeHoverTooltips, hasHoverTooltips, hoverTooltip, keymap, type Tooltip } from '@codemirror/view';
import type { Hover, HoverParams } from 'vscode-languageserver-protocol';
import { documentation } from '@/language-servers/documentation';

/**
 * Returns the extension that shows the server's documentation for the code under the pointer.
 */
export function serverHover(): Extension {
  // Copied from `@codemirror/lsp-client`'s `lspTooltipSource`.
  //
  // Shows the code blocks that open the documentation as a highlighted definition above the rest.
  return [
    hoverTooltip(
      async (view, pos): Promise<Tooltip | null> => {
        const plugin = LSPPlugin.get(view);
        if (!plugin?.client.serverCapabilities?.hoverProvider) {
          return null;
        }

        plugin.client.sync();
        const result = await plugin.client.request<HoverParams, Hover | null>('textDocument/hover', {
          position: plugin.toPosition(pos),
          textDocument: { uri: plugin.uri },
        });
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
      },
      { hideOn: (tr) => tr.docChanged },
    ),
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (!hasHoverTooltips(view.state)) {
            return false;
          }
          view.dispatch({ effects: closeHoverTooltips });
          return true;
        },
      },
    ]),
  ];
}
