import { HighlightStyle, LanguageDescription, type LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { OS, shortcut } from '@elsewise/components/lib/os';
import { tags } from '@lezer/highlight';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { link } from '@/components/code-editor/link.ts';

const URL = 'https://example.com/a?b=c#d';

const DOC = `// See ${URL}.\nconst url = '${URL}';\n// [docs](${URL})\nno link here`;

const KEY = OS === 'mac' ? { metaKey: true } : { ctrlKey: true };

const COMMENT = 'rgb(0, 128, 0)';
const STRING = 'rgb(128, 0, 0)';
const LINK = 'rgb(0, 0, 255)';

let javascript: LanguageSupport;

beforeAll(async () => {
  javascript = await (LanguageDescription.matchFilename(languages, 'main.js') as LanguageDescription).load();
});

let view: EditorView;

beforeEach(() => {
  const host = document.body.appendChild(document.createElement('div'));
  host.style.fontFamily = 'monospace';
  view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        javascript,
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: tags.comment, color: COMMENT },
            { tag: tags.string, color: STRING },
            { tag: tags.link, color: LINK },
          ]),
        ),
        link(),
      ],
    }),
    parent: host,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  view.dom.parentElement?.remove();
  view.destroy();
});

// The center of the character at `pos`.
function at(pos: number): { clientX: number; clientY: number } {
  const box = view.coordsForChar(pos);
  if (box === null) {
    throw new Error(`no character at ${pos}`);
  }
  return { clientX: (box.left + box.right) / 2, clientY: (box.top + box.bottom) / 2 };
}

// The center of the space past the end of `line`.
function pastEnd(line: number): { clientX: number; clientY: number } {
  const { to } = view.state.doc.line(line);
  const box = view.coordsAtPos(to);
  if (box === null) {
    throw new Error(`no line ${line}`);
  }
  return { clientX: box.right + 4 * view.defaultCharacterWidth, clientY: (box.top + box.bottom) / 2 };
}

// The color of the underline drawn last, by the innermost element, under the character at `pos`.
function underline(pos: number): string {
  const { node } = view.domAtPos(pos + 1);
  const element = node instanceof Element ? node : node.parentElement;
  if (element === null) {
    throw new Error(`no element at ${pos}`);
  }
  return getComputedStyle(element).textDecorationColor;
}

// The text of each element that has `className`.
function texts(className: string): string[] {
  return [...view.contentDOM.querySelectorAll(`.${className}`)].map((element) => element.textContent ?? '');
}

function move(coords: { clientX: number; clientY: number }, init: MouseEventInit = {}): void {
  // The hover tooltip looks at the element under the pointer.
  (document.elementFromPoint(coords.clientX, coords.clientY) ?? view.contentDOM).dispatchEvent(
    new MouseEvent('mousemove', { ...coords, ...init, bubbles: true }),
  );
}

function click(coords: { clientX: number; clientY: number }, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('mousedown', { ...coords, ...init, button: 0, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event;
}

describe('links', () => {
  test('underlines every URL, without trailing punctuation, quotes and brackets', () => {
    expect(texts('cm-link')).toEqual([URL, URL, URL]);
  });

  test('underlines each URL in the color of its token', () => {
    expect(underline(DOC.indexOf(URL))).toBe(COMMENT);
    expect(underline(DOC.indexOf(URL, DOC.indexOf("'")))).toBe(STRING);
  });

  test('underlines the URL under the pointer in the link color while the key is held', () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    expect(underline(DOC.indexOf(URL))).toBe(LINK);
  });

  test('shows the whole URL under the pointer as a link while the key is held', () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    expect(texts('cm-link-active')).toEqual([URL]);
  });

  test('shows no link without the key', () => {
    move(at(DOC.indexOf(URL) + 5));
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('shows no link once the key is released', () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keyup', { key: OS === 'mac' ? 'Meta' : 'Control', bubbles: true }),
    );
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('shows no link once the pointer leaves', () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    view.contentDOM.dispatchEvent(new MouseEvent('mouseleave', KEY));
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('shows the key in a tooltip over a URL', async () => {
    move(at(DOC.indexOf(URL) + 5));
    const tooltip = await vi.waitFor(
      () => {
        const hint = view.dom.querySelector('.cm-tooltip-hover .cm-link-hint');
        expect(hint).not.toBeNull();
        return hint as HTMLElement;
      },
      { timeout: 2000 },
    );
    expect(tooltip.textContent).toBe(`${shortcut('Mod-Click')} open in browser`);
  });

  test('opens the URL on click while the key is held', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const event = click(at(DOC.indexOf(URL) + 5), KEY);
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.ranges).toHaveLength(1);
  });

  test('opens nothing past the end of a line that ends in a URL', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    click(pastEnd(3), KEY);
    move(pastEnd(3), KEY);
    expect(open).not.toHaveBeenCalled();
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('leaves a click on plain text to add a cursor', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    click(at(DOC.indexOf('no link')), KEY);
    expect(open).not.toHaveBeenCalled();
    expect(view.state.selection.ranges).toHaveLength(2);
  });

  test('shows no link once the document changes, and underlines the URLs at their new positions', () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    view.dispatch({ changes: { from: '// '.length, insert: `${URL} ` } });
    expect(texts('cm-link-active')).toEqual([]);
    expect(texts('cm-link')).toEqual([URL, URL, URL, URL]);
  });
});
