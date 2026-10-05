import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { DEFAULT_EDITOR_CONTEXT_MENU, type PluginContext } from '@elsewise/plugin';
import { colorPicker } from './color-picker.ts';

const EXCUSES = [
  'It worked on my machine.',
  'Here be dragons.',
  'When I wrote this, only God and I knew how it worked. Now only God knows.',
  'Dear future me, I am so sorry.',
  'Temporary fix, 2019.',
];

/**
 * Called when Elsewise enables the plugin.
 */
export function enable({ editor, subscriptions }: PluginContext): void {
  subscriptions.push(
    editor.addExtensions([colorPicker]),
    editor.addLanguages([
      LanguageDescription.of({
        name: 'Dotenv',
        filename: /(^|[\\/])\.env(\.\w+)?$/,
        support: new LanguageSupport(
          StreamLanguage.define({
            token(stream) {
              if (stream.sol() && stream.match(/^\s*#.*/)) {
                return 'comment';
              }
              if (stream.sol() && stream.match(/^\w+(?==)/)) {
                return 'propertyName';
              }
              if (stream.eat('=')) {
                return 'operator';
              }

              stream.skipToEnd();
              return 'string';
            },
          }),
        ),
      }),
    ]),
    editor.addContextMenuItems({
      // An item in the built-in code group, between the "toggle comment" and "fold" items.
      [DEFAULT_EDITOR_CONTEXT_MENU.code.id]: [
        {
          type: 'item',
          id: '15-leave-an-excuse',
          label: 'Leave an excuse',
          command: excuse,
          shown: (state) => lineComment(state) !== undefined,
        },
      ],
      // A new group after the built-in groups.
      '30-reactions': [
        {
          type: 'item',
          id: '10-shrug',
          label: 'Shrug',
          command: (view) => view.dispatch(view.state.replaceSelection('¯\\_(ツ)_/¯')),
        },
        {
          type: 'item',
          id: '20-flip-the-table',
          label: 'Flip the table',
          command: (view) => view.dispatch(view.state.replaceSelection('(╯°□°)╯︵ ┻━┻')),
        },
        {
          type: 'item',
          id: '30-roll-a-d20',
          label: 'Roll a d20',
          command: (view) => view.dispatch(view.state.replaceSelection(String(1 + Math.floor(Math.random() * 20)))),
        },
      ],
      // A submenu for changing the selection's tone of voice.
      '40-tone': [
        {
          type: 'submenu',
          id: '10-tone-of-voice',
          label: 'Tone of voice',
          items: {
            '10-tones': [
              {
                type: 'item',
                id: '10-uwu',
                label: 'uwu',
                command: (view) => convert(view, (text) => text.replace(/[rl]/g, 'w').replace(/[RL]/g, 'W')),
                shown: selected,
              },
              {
                type: 'item',
                id: '20-vaporwave',
                label: 'ｖａｐｏｒｗａｖｅ',
                command: (view) =>
                  convert(view, (text) =>
                    text.replace(/[!-~]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0)),
                  ),
                shown: selected,
              },
              {
                type: 'item',
                id: '30-mocking',
                label: 'mOcKiNg',
                command: (view) =>
                  convert(view, (text) =>
                    [...text].map((char, index) => (index % 2 ? char.toUpperCase() : char.toLowerCase())).join(''),
                  ),
                shown: selected,
              },
            ],
          },
        },
      ],
    }),
  );
}

function selected(state: EditorState): boolean {
  return state.selection.ranges.some((range) => !range.empty);
}

// Replaces each selection with what `transform` returns for its text.
function convert(view: EditorView, transform: (text: string) => string): void {
  view.dispatch(
    view.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: transform(view.state.sliceDoc(range.from, range.to)) },
      range,
    })),
  );
}

// Returns what starts a line comment in the language at the cursor.
function lineComment(state: EditorState): string | undefined {
  return state.languageDataAt<{ line?: string }>('commentTokens', state.selection.main.head)[0]?.line;
}

// Adds a comment with an excuse above the cursor's line.
function excuse(view: EditorView): void {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const indent = /^\s*/.exec(line.text)?.[0] ?? '';
  const text = EXCUSES[Math.floor(Math.random() * EXCUSES.length)];
  view.dispatch({ changes: { from: line.from, insert: `${indent}${lineComment(view.state)} ${text}\n` } });
}
