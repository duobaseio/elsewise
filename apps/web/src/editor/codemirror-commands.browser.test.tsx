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

describe('UNDO', () => {
  test('reverts typing', async () => {
    const view = open(0);
    await userEvent.keyboard('x');

    await userEvent.keyboard('{Meta>}z{/Meta}');
    expect(view.state.doc.toString()).toBe(DOC);
  });
});

describe('REDO', () => {
  test('reapplies undone typing', async () => {
    const view = open(0);
    await userEvent.keyboard('x');
    await userEvent.keyboard('{Meta>}z{/Meta}');

    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(view.state.doc.toString()).toBe(`x${DOC}`);
  });
});

describe('FOLD', () => {
  test('collapses block at caret', async () => {
    const view = open(0);

    await userEvent.keyboard('{Meta>}-{/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(1);
  });
});

describe('UNFOLD', () => {
  test('expands block at caret', async () => {
    const view = open(0);
    await userEvent.keyboard('{Meta>}-{/Meta}');

    await userEvent.keyboard('{Meta>}={/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(0);
  });
});

describe('FOLD_ALL', () => {
  test('collapses every block', async () => {
    const view = open(0, `${DOC}fn other() {\n    let b = 2;\n}\n`);

    await userEvent.keyboard('{Meta>}{Shift>}-{/Shift}{/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(2);
  });
});

describe('UNFOLD_ALL', () => {
  test('expands every block', async () => {
    const view = open(0, `${DOC}fn other() {\n    let b = 2;\n}\n`);
    await userEvent.keyboard('{Meta>}{Shift>}-{/Shift}{/Meta}');

    await userEvent.keyboard('{Meta>}{Shift>}={/Shift}{/Meta}');
    expect(view.dom.querySelectorAll('.cm-foldPlaceholder')).toHaveLength(0);
  });
});

describe('INDENT', () => {
  test('shifts selected line right on Tab', async () => {
    const view = open(DOC.indexOf('let'));
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from, head: view.state.doc.line(2).to } });

    await userEvent.keyboard('{Tab}');
    expect(view.state.doc.line(2).text).toBe('      let a = 1;');
  });

  test('leaves Tab to browser in read-only document', () => {
    const view = open(0);
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });
    const event = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('UNINDENT', () => {
  test('shifts selected line left on Shift-Tab', async () => {
    const view = open(DOC.indexOf('let'));
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from, head: view.state.doc.line(2).to } });

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(view.state.doc.line(2).text).toBe('  let a = 1;');
  });
});

describe('DUPLICATE_LINE', () => {
  test('copies line below', async () => {
    const view = open(DOC.indexOf('let'));

    await userEvent.keyboard('{Meta>}d{/Meta}');
    expect(view.state.doc.line(3).text).toBe('    let a = 1;');
  });
});

describe('TOGGLE_LINE_COMMENT', () => {
  test('comments out line', async () => {
    const view = open(DOC.indexOf('let'));

    await userEvent.keyboard('{Meta>}/{/Meta}');
    expect(view.state.doc.line(2).text).toBe('    // let a = 1;');
  });
});

describe('EXTEND_SELECTION', () => {
  test('selects word at caret', async () => {
    const view = open(DOC.indexOf('a ='));

    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('a');
  });
});
