import { type CompletionContext, startCompletion } from '@codemirror/autocomplete';
import { insertTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import { formatKey } from '@elsewise/components/lib/platform';
import type { EditorCompletion } from '@elsewise/plugin';
import { tags as t } from '@lezer/highlight';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { completion } from '@/editor/completion';

const HIGHLIGHT = HighlightStyle.define([
  { tag: t.function(t.propertyName), color: '#102030' },
  { tag: t.propertyName, color: '#405060' },
  { tag: t.typeName, color: '#708090' },
]);

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `doc` with the cursor at its `|`, completing the word before the cursor with `options`.
function open(doc: string, options: EditorCompletion[]): EditorView {
  const source = (context: CompletionContext) => ({ from: context.matchBefore(/\w*/)?.from ?? context.pos, options });
  const view = new EditorView({
    state: EditorState.create({
      doc: doc.replace('|', ''),
      selection: { anchor: doc.indexOf('|') },
      extensions: [
        completion(),
        EditorState.languageData.of(() => [{ autocomplete: source }]),
        syntaxHighlighting(HIGHLIGHT),
        keymap.of([{ key: 'Tab', run: insertTab }]),
      ],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Opens the completions at the cursor, and returns their rows once shown and ready to pick.
async function complete(view: EditorView): Promise<HTMLElement[]> {
  view.focus();
  startCompletion(view);
  const rows = await vi.waitFor(() => {
    const rows = [...view.dom.querySelectorAll<HTMLElement>('.cm-tooltip-autocomplete li')];
    expect(rows).not.toHaveLength(0);
    return rows;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return rows;
}

function press(view: EditorView, key: string): void {
  runScopeHandlers(view, new KeyboardEvent('keydown', { key }), 'editor');
}

function text(row: HTMLElement, selector: string): string | undefined {
  return row.querySelector(selector)?.textContent ?? undefined;
}

describe('completion', () => {
  test('shows each type as letterform colored like syntax', async () => {
    const view = open('channel.se|', [
      { label: 'send', type: 'method' },
      { label: 'session', type: 'property' },
      { label: 'Session', type: 'type' },
      { label: 'serde', type: 'namespace' },
      { label: 'select', type: 'snippet' },
      { label: 'sender', type: 'event' },
      { label: 'seed' },
    ]);

    const rows = await complete(view);

    const letterforms = Object.fromEntries(
      rows.map((row) => {
        const letterform = row.querySelector<HTMLElement>('.cm-completionKind');
        const color = getComputedStyle(letterform as HTMLElement).color;
        return [
          text(row, '.cm-completionLabel'),
          [letterform?.textContent, color === getComputedStyle(row).color ? 'row' : color],
        ];
      }),
    );
    expect(letterforms).toEqual({
      send: ['m', 'rgb(16, 32, 48)'],
      session: ['p', 'rgb(64, 80, 96)'],
      Session: ['T', 'rgb(112, 128, 144)'],
      serde: ['M', 'row'],
      select: ['{}', 'row'],
      sender: ['t', 'row'],
      seed: ['', 'row'],
    });
    expect(view.dom.querySelector('.cm-completionIcon')).toBeNull();
  });

  test('shows icon over type letterform', async () => {
    const view = open('channel.se|', [
      { label: 'send', type: 'method', icon: { letters: 'Tx', tag: t.typeName } },
      { label: 'session', icon: { letters: 'q' } },
    ]);

    const [send, session] = await complete(view);

    const color = (row: HTMLElement) => getComputedStyle(row.querySelector('.cm-completionKind') as HTMLElement).color;
    expect(text(send, '.cm-completionKind')).toBe('Tx');
    expect(color(send)).toBe('rgb(112, 128, 144)');
    expect(text(session, '.cm-completionKind')).toBe('q');
    expect(color(session)).toBe(getComputedStyle(session).color);
  });

  test("draws SVG icon's shape in tag color", async () => {
    const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>';
    const svg = `data:image/svg+xml,${encodeURIComponent(circle)}`;
    const view = open('channel.se|', [
      { label: 'send', icon: { svg, tag: t.propertyName } },
      { label: 'session', icon: { svg } },
    ]);

    const [send, session] = await complete(view);

    const style = (row: HTMLElement) => getComputedStyle(row.querySelector('.cm-completionKind') as HTMLElement);
    expect(style(send).maskImage).toBe(`url("${svg}")`);
    expect(style(send).backgroundColor).toBe('rgb(64, 80, 96)');
    expect(style(send).width).toBe('16px');
    expect(style(send).height).toBe('16px');
    expect(style(session).backgroundColor).toBe(getComputedStyle(session).color);
  });

  test('draws image as is', async () => {
    const square =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="red"/></svg>';
    const image = `data:image/svg+xml,${encodeURIComponent(square)}`;
    const view = open('channel.se|', [{ label: 'send', icon: { image } }]);

    const [send] = await complete(view);

    const icon = send.querySelector<HTMLImageElement>('img.cm-completionKind');
    expect(icon?.src).toBe(image);
    expect(icon?.getBoundingClientRect()).toMatchObject({ width: 16, height: 16 });
  });

  test('shows tail after label and detail on right', async () => {
    const view = open('channel.se|', [
      { label: 'send', tail: '(bytes: Bytes)', detail: 'Result<()>' },
      { label: 'session', detail: 'SessionId' },
    ]);

    const [send, session] = await complete(view);

    expect(text(send, '.cm-completionTail')).toBe('(bytes: Bytes)');
    expect(text(send, '.cm-completionDetail')).toBe('Result<()>');
    expect(text(session, '.cm-completionTail')).toBeUndefined();
    expect(text(session, '.cm-completionDetail')).toBe('SessionId');
  });

  test('marks deprecated items', async () => {
    const view = open('channel.se|', [{ label: 'send' }, { label: 'send_raw', deprecated: true }]);

    const rows = await complete(view);

    expect(rows.map((row) => row.classList.contains('cm-completion-deprecated'))).toEqual([false, true]);
  });

  test('shows hint below list', async () => {
    const view = open('channel.se|', [{ label: 'send' }]);

    await complete(view);

    expect(view.dom.querySelector('.cm-tooltip-autocomplete > .cm-completion-hint')?.textContent).toBe(
      `${formatKey('Enter')} insert · ${formatKey('Tab')} replace`,
    );
  });

  test('inserts with Enter and replaces rest of word with Tab', async () => {
    const options = [{ label: 'send' }];
    const inserted = open('channel.se|lect()', options);
    await complete(inserted);
    press(inserted, 'Enter');
    const replaced = open('channel.se|lect()', options);
    await complete(replaced);
    press(replaced, 'Tab');

    expect(inserted.state.doc.toString()).toBe('channel.sendlect()');
    expect(replaced.state.doc.toString()).toBe('channel.send()');
  });

  test('leaves Tab to editor without completions', async () => {
    const view = open('se|', []);

    press(view, 'Tab');

    expect(view.state.doc.toString()).toBe('se\t');
  });
});
