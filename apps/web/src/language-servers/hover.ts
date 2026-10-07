import { highlightingFor, language } from '@codemirror/language';
import { LSPPlugin } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import { highlightCode } from '@lezer/highlight';
import type { Hover, HoverParams } from 'vscode-languageserver-protocol';

/**
 * Matches a fenced code block. Only a match at the start of the text opens the hover.
 */
const FENCE = /^(`{3,})([^`\n]*)\n([\s\S]*?)^\1`*[ \t]*$/m;

/**
 * Matches a thematic break at the start of the text, which servers put between the definition and the documentation.
 */
const BREAK = /^(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\n|$)/;

/**
 * Returns the extension that shows the server's documentation for the code under the pointer.
 */
export function serverHover(): Extension {
  return hoverTooltip(
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

      const parts = Array.isArray(result.contents) ? result.contents : [result.contents];
      const definition: [tag: string, code: string][] = [];
      let content = '';

      if (parts.length === 1 && typeof parts[0] === 'object' && 'kind' in parts[0] && parts[0].kind === 'plaintext') {
        content = plugin.docToHTML(parts[0]);
      } else {
        let markdown = parts
          .map((part) =>
            typeof part === 'string'
              ? part
              : 'kind' in part
                ? part.value
                : `\`\`\`${part.language}\n${part.value}\n\`\`\``,
          )
          .join('\n\n')
          .trimStart();

        for (let match = FENCE.exec(markdown); match?.index === 0; match = FENCE.exec(markdown)) {
          definition.push([match[2].trim().split(/\s/)[0], match[3].replace(/\n$/, '')]);
          markdown = markdown.slice(match[0].length).trimStart();
        }

        markdown = markdown.replace(BREAK, '');
        if (markdown.trim() !== '') {
          content = plugin.docToHTML({ kind: 'markdown', value: markdown });
        }
      }

      if (definition.length === 0 && content === '') {
        return null;
      }

      return {
        pos: result.range ? plugin.fromPosition(result.range.start) : pos,
        end: result.range ? plugin.fromPosition(result.range.end) : pos,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-lsp-hover-tooltip';

          if (definition.length > 0) {
            const block = dom.appendChild(document.createElement('div'));
            block.className = 'cm-lsp-hover-definition';

            const current = view.state.facet(language);
            for (const [tag, code] of definition) {
              const pre = block.appendChild(document.createElement('pre'));
              if (current === null || (tag !== '' && tag.toLowerCase() !== current.name.toLowerCase())) {
                pre.textContent = code;
                continue;
              }

              highlightCode(
                code,
                current.parser.parse(code),
                { style: (tags) => highlightingFor(view.state, tags) },
                (text, classes) => {
                  if (classes === '') {
                    pre.append(text);
                  } else {
                    const span = pre.appendChild(document.createElement('span'));
                    span.className = classes;
                    span.textContent = text;
                  }
                },
                () => pre.append('\n'),
              );
            }
          }

          if (content !== '') {
            const block = dom.appendChild(document.createElement('div'));
            block.className = 'cm-lsp-hover-content cm-lsp-documentation';
            block.innerHTML = content;
          }

          return { dom };
        },
      };
    },
    { hideOn: (tr) => tr.docChanged },
  );
}
