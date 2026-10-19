import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { Application, EditorCommand, PluginContext } from '@elsewise/plugin';
import { colorHover, colorPicker } from './color-picker.ts';
import { keys, reactions } from './completions.ts';

const EXCUSES = [
  'It worked on my machine.',
  'Here be dragons.',
  'When I wrote this, only God and I knew how it worked. Now only God knows.',
  'Dear future me, I am so sorry.',
  'Temporary fix, 2019.',
];

const dotenv = StreamLanguage.define({
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
});

/**
 * Called when Elsewise enables the plugin.
 */
export function enable({ commands, editor }: Application, { id, subscriptions }: PluginContext): void {
  subscriptions.push(
    editor.addExtensions([colorPicker, colorHover, reactions]),
    editor.addLanguages([
      LanguageDescription.of({
        name: 'Dotenv',
        filename: /(^|[\\/])\.env(\.\w+)?$/,
        // Completes keys in Dotenv documents only.
        support: new LanguageSupport(dotenv, dotenv.data.of({ autocomplete: keys })),
      }),
    ]),
    // The context menu items in `manifest.json` run these.
    commands.add([
      excuse(`${id}.leaveAnExcuse`),
      reaction(`${id}.shrug`, 'Shrug', () => '¯\\_(ツ)_/¯'),
      reaction(`${id}.flipTheTable`, 'Flip the table', () => '(╯°□°)╯︵ ┻━┻'),
      reaction(`${id}.rollAD20`, 'Roll a d20', () => String(1 + Math.floor(Math.random() * 20))),
      tone(`${id}.uwu`, 'uwu', (text) => text.replace(/[rl]/g, 'w').replace(/[RL]/g, 'W')),
      tone(`${id}.vaporwave`, 'ｖａｐｏｒｗａｖｅ', (text) =>
        text.replace(/[!-~]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0)),
      ),
      tone(`${id}.mocking`, 'mOcKiNg', (text) =>
        [...text].map((char, index) => (index % 2 ? char.toUpperCase() : char.toLowerCase())).join(''),
      ),
    ]),
  );
}

function excuse(id: string): EditorCommand {
  const comment = (state: EditorState) =>
    state.languageDataAt<{ line?: string }>('commentTokens', state.selection.main.head)[0]?.line;

  return {
    scope: 'editor',
    id,
    label: 'Leave an excuse',
    shown: (_, view) => comment(view.state) !== undefined,
    run: (_, view) => {
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const indent = /^\s*/.exec(line.text)?.[0] ?? '';
      const text = EXCUSES[Math.floor(Math.random() * EXCUSES.length)];
      view.dispatch({ changes: { from: line.from, insert: `${indent}${comment(view.state)} ${text}\n` } });
      return true;
    },
  };
}

function reaction(id: string, label: string, text: () => string): EditorCommand {
  return {
    scope: 'editor',
    id,
    label,
    run: (_, view) => {
      view.dispatch(view.state.replaceSelection(text()));
      return true;
    },
  };
}

function tone(id: string, label: string, transform: (text: string) => string): EditorCommand {
  return {
    scope: 'editor',
    id,
    label,
    shown: (_, view) => view.state.selection.ranges.some((range) => !range.empty),
    run: (_, view) => {
      view.dispatch(
        view.state.changeByRange((range) => ({
          changes: { from: range.from, to: range.to, insert: transform(view.state.sliceDoc(range.from, range.to)) },
          range,
        })),
      );
      return true;
    },
  };
}
