import { HighlightStyle, LanguageDescription, type LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { formatKey, PLATFORM } from '@elsewise/components/lib/platform';
import type { EditorNavigation, EditorNavigationSource } from '@elsewise/plugin';
import { tags } from '@lezer/highlight';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { navigation } from '@/editor/navigation';

const URL = 'https://example.com/a?b=c#d';

const DOC = `// See ${URL}.\nconst url = '${URL}';\n// [docs](${URL})\nno link here`;

const KEY = PLATFORM === 'mac' ? { metaKey: true } : { ctrlKey: true };

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
        navigation(),
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

// Waits for the sources that have returned to show their navigation.
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

function add(source: EditorNavigationSource): void {
  view.dispatch({
    effects: StateEffect.appendConfig.of(EditorState.languageData.of(() => [{ navigation: source }])),
  });
}

// A navigation from the first `length` characters of `text`, which records `name`.
function to(navigated: string[], name: string, text: string, length = text.length): EditorNavigation {
  return { from: DOC.indexOf(text), to: DOC.indexOf(text) + length, navigate: () => void navigated.push(name) };
}

describe('navigation', () => {
  test('underlines every URL, without trailing punctuation, quotes and brackets', () => {
    expect(texts('cm-link')).toEqual([URL, URL, URL]);
  });

  test('underlines each URL in token color', () => {
    expect(underline(DOC.indexOf(URL))).toBe(COMMENT);
    expect(underline(DOC.indexOf(URL, DOC.indexOf("'")))).toBe(STRING);
  });

  test('underlines hovered URL in link color while key held', async () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    await settle();
    expect(underline(DOC.indexOf(URL))).toBe(LINK);
  });

  test('shows whole hovered URL as link while key held', async () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    await settle();
    expect(texts('cm-link-active')).toEqual([URL]);
  });

  test('shows no link without key', async () => {
    move(at(DOC.indexOf(URL) + 5));
    await settle();
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('shows no link once key released', async () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    await settle();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keyup', { key: PLATFORM === 'mac' ? 'Meta' : 'Control', bubbles: true }),
    );
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('shows no link once pointer leaves', async () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    await settle();
    view.contentDOM.dispatchEvent(new MouseEvent('mouseleave', KEY));
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('shows navigation from lowest order that resolves, however slow', async () => {
    const navigated: string[] = [];
    let resolve: (navigation: EditorNavigation) => void = () => {};
    add({ order: 5, navigation: () => new Promise((found) => (resolve = found)) });
    add({ order: 15, navigation: () => to(navigated, 'later', URL, 3) });
    move(at(DOC.indexOf(URL) + 1), KEY);
    await settle();
    expect(texts('cm-link-active')).toEqual([]);

    resolve(to(navigated, 'first', URL, 5));
    await settle();
    expect(texts('cm-link-active')).toEqual(['https']);
    click(at(DOC.indexOf(URL) + 1), KEY);
    expect(navigated).toEqual(['first']);
  });

  test('skips sources that find nothing or throw', async () => {
    add({ order: 5, navigation: () => null });
    add({ order: 6, navigation: () => Promise.reject(new Error('down')) });
    add({
      order: 7,
      navigation: () => {
        throw new Error('down');
      },
    });
    move(at(DOC.indexOf(URL) + 5), KEY);
    await settle();
    expect(texts('cm-link-active')).toEqual([URL]);
  });

  test('tries sources without order last', async () => {
    const navigated: string[] = [];
    add({ navigation: () => to(navigated, 'unordered', URL, 5) });
    move(at(DOC.indexOf(URL) + 1), KEY);
    await settle();
    expect(texts('cm-link-active')).toEqual([URL]);
  });

  test('asks sources once per word', async () => {
    const navigation = vi.fn(() => null);
    add({ navigation });
    for (let i = 0; i < 4; i++) {
      move(at(DOC.indexOf('here') + i), KEY);
      await settle();
    }
    expect(navigation).toHaveBeenCalledTimes(1);
    expect(navigation).toHaveBeenCalledWith(view, DOC.indexOf('here'), 1);
  });

  test('asks sources once past word', async () => {
    const navigation = vi.fn(() => null);
    add({ navigation });
    move(at(DOC.indexOf(' here')), KEY);
    await settle();
    click(at(DOC.indexOf(' here')), KEY);
    await settle();
    expect(navigation).toHaveBeenCalledTimes(1);
  });

  test('ignores navigation off character, and asks once', async () => {
    const navigation = vi.fn(() => to([], 'elsewhere', 'no link', 2));
    add({ order: 5, navigation });
    move(at(DOC.indexOf('here')), KEY);
    await settle();
    expect(texts('cm-link-active')).toEqual([]);
    expect(navigation).toHaveBeenCalledTimes(1);
  });

  test('drops navigation found once pointer moved off it', async () => {
    let resolve: (navigation: EditorNavigation) => void = () => {};
    add({ order: 5, navigation: () => new Promise((found) => (resolve = found)) });
    move(at(DOC.indexOf('here')), KEY);
    move(at(DOC.indexOf('no link')), KEY);
    resolve(to([], 'here', 'here'));
    await settle();
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('shows key in tooltip over URL', async () => {
    move(at(DOC.indexOf(URL) + 5));
    await vi.waitFor(
      () =>
        expect(view.dom.querySelector('.cm-tooltip-hover .cm-link-hint')?.textContent).toBe(
          `${formatKey('Mod-Click')} open in browser`,
        ),
      { timeout: 2000 },
    );
  });

  test('opens URL on click while key held', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    move(at(DOC.indexOf(URL) + 5), KEY);
    await settle();
    const event = click(at(DOC.indexOf(URL) + 5), KEY);
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.ranges).toHaveLength(1);
  });

  test('navigates once found after click', async () => {
    const navigated: string[] = [];
    let resolve: (navigation: EditorNavigation) => void = () => {};
    add({ navigation: () => new Promise((found) => (resolve = found)) });
    click(at(DOC.indexOf('here')), KEY);
    expect(view.state.selection.ranges).toHaveLength(2);
    resolve(to(navigated, 'here', 'here'));
    await settle();
    expect(navigated).toEqual(['here']);
  });

  test('opens nothing past line ending in URL', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const end = view.coordsAtPos(view.state.doc.line(3).to);
    if (end === null) {
      throw new Error('no line 3');
    }
    const pastEnd = { clientX: end.right + 4 * view.defaultCharacterWidth, clientY: (end.top + end.bottom) / 2 };
    click(pastEnd, KEY);
    move(pastEnd, KEY);
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(texts('cm-link-active')).toEqual([]);
  });

  test('leaves click on plain text to add cursor', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    click(at(DOC.indexOf('no link')), KEY);
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(view.state.selection.ranges).toHaveLength(2);
  });

  test('shows error of failed navigation', async () => {
    const toastAdd = vi.spyOn(toast, 'add');
    add({ order: 5, navigation: () => ({ from: 0, to: 2, navigate: () => Promise.reject(new Error('gone')) }) });
    move(at(0), KEY);
    await settle();
    click(at(0), KEY);
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ description: 'gone' })));
  });

  test('shows no link once document changes, and underlines URLs at new positions', async () => {
    move(at(DOC.indexOf(URL) + 5), KEY);
    await settle();
    view.dispatch({ changes: { from: '// '.length, insert: `${URL} ` } });
    expect(texts('cm-link-active')).toEqual([]);
    expect(texts('cm-link')).toEqual([URL, URL, URL, URL]);
  });
});
