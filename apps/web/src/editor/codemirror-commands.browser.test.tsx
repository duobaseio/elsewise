import { history } from '@codemirror/commands';
import { foldGutter, LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { commandsExtension } from '../../test/commands';

const DOC = 'fn main() {\n    let a = 1;\n}\n';

let rust: LanguageSupport;
const views: EditorView[] = [];

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens a focused Rust editor with the built-in commands' keys and the caret at `anchor`.
function open(anchor: number, doc = DOC): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [history(), foldGutter(), rust, commandsExtension()],
    }),
    parent: document.body,
  });
  views.push(view);
  view.focus();
  return view;
}

describe('HISTORY', () => {
  test('undoes and redoes', async () => {
    const view = open(0);
    await userEvent.keyboard('x');

    await userEvent.keyboard('{Meta>}z{/Meta}');
    expect(view.state.doc.toString()).toBe(DOC);
    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(view.state.doc.toString()).toBe(`x${DOC}`);
  });
});

describe('FOLD', () => {
  test('folds and unfolds', async () => {
    const view = open(0);

    await userEvent.keyboard('{Meta>}-{/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(1);
    await userEvent.keyboard('{Meta>}={/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(0);
  });

  test('folds and unfolds all', async () => {
    const view = open(0, `${DOC}fn other() {\n    let b = 2;\n}\n`);

    await userEvent.keyboard('{Meta>}{Shift>}-{/Shift}{/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(2);
    await userEvent.keyboard('{Meta>}{Shift>}={/Shift}{/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(0);
  });
});

describe('EDIT', () => {
  test('indents and unindents', async () => {
    const view = open(DOC.indexOf('let'));
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from, head: view.state.doc.line(2).to } });

    await userEvent.keyboard('{Tab}');
    expect(view.state.doc.line(2).text).toBe('      let a = 1;');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(view.state.doc.line(2).text).toBe('    let a = 1;');
  });

  test('leaves Tab to browser in read-only document', () => {
    const view = open(0);
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });
    const event = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  test('duplicates line and toggles line comment', async () => {
    const view = open(DOC.indexOf('let'));

    await userEvent.keyboard('{Meta>}d{/Meta}');
    expect(view.state.doc.line(3).text).toBe('    let a = 1;');
    await userEvent.keyboard('{Meta>}/{/Meta}');
    expect(view.state.doc.line(3).text).toBe('    // let a = 1;');
  });
});

describe('CARET', () => {
  test('extends selection', async () => {
    const view = open(DOC.indexOf('a ='));

    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('a');
  });
});
