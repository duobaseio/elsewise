import { highlightingFor, language } from '@codemirror/language';
import type { LSPPlugin } from '@codemirror/lsp-client';
import { highlightCode } from '@lezer/highlight';
import type { MarkupContent } from 'vscode-languageserver-protocol';

/**
 * Matches a fenced code block. Only a match at the start of the text opens the documentation.
 */
const FENCE = /^(`{3,})([^`\n]*)\n([\s\S]*?)^\1`*[ \t]*$/m;

/**
 * Matches a thematic break at the start of the text, which servers put between the definition and the documentation.
 */
const BREAK = /^(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\n|$)/;

/**
 * Returns the DOM that shows `docs` after the code in `signatures`, or null if there is nothing to show.
 *
 * The code blocks that open markdown `docs` are shown with `signatures`, highlighted with the editor's language and
 * theme.
 */
export function documentation(
  plugin: LSPPlugin,
  docs: string | MarkupContent | undefined,
  signatures: readonly string[] = [],
): HTMLElement | null {
  const definition: [tag: string, code: string][] = signatures.map((code) => ['', code]);
  let content = '';
  if (typeof docs === 'string' || docs?.kind === 'plaintext') {
    content = plugin.docToHTML(docs);
  } else if (docs !== undefined) {
    let markdown = docs.value.trimStart();
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

  const dom = document.createElement('div');

  if (definition.length > 0) {
    const block = dom.appendChild(document.createElement('div'));
    block.className = 'cm-lsp-definition';

    const { state } = plugin.view;
    const current = state.facet(language);
    for (const [tag, code] of definition) {
      const pre = block.appendChild(document.createElement('pre'));
      if (current === null || (tag !== '' && tag.toLowerCase() !== current.name.toLowerCase())) {
        pre.textContent = code;
        continue;
      }

      // Based on `@codemirror/lsp-client`'s `renderCode`, which builds HTML instead.
      highlightCode(
        code,
        current.parser.parse(code),
        { style: (tags) => highlightingFor(state, tags) },
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
    block.className = 'cm-lsp-content cm-lsp-documentation';
    block.innerHTML = content;
  }

  return dom;
}
