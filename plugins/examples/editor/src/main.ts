import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { DEFAULT_EDITOR_CONTEXT_MENU, type EditorCommand, type Plugin, type PluginInfo } from '@elsewise/plugin';
import { colorHover, colorPicker } from './color-picker.ts';
import { keys, reactions } from './completions.ts';

// Previewed in Dotenv's settings.
const PREVIEW = `# The daemon
PORT=3000
LOG_LEVEL=debug

# The database
DATABASE_URL="postgres://elsewise:secret@localhost:5432/elsewise"
`;

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
 * Returns the plugin.
 */
export default function ({ id }: PluginInfo): Plugin {
  return {
    onEnable({ commands, editor, settings }) {
      return [
        settings.addLanguagePreviews([{ language: 'Dotenv', path: '.env', code: PREVIEW }]),
        editor.addExtensions([colorPicker, colorHover, reactions]),
        editor.languages.add([
          LanguageDescription.of({
            name: 'Dotenv',
            filename: /(^|[\\/])\.env(\.\w+)?$/,
            // Completes keys in Dotenv documents only.
            support: new LanguageSupport(dotenv, dotenv.data.of({ autocomplete: keys })),
          }),
        ]),
        // The context menu items below run these.
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
        editor.addContextMenu([
          { id: DEFAULT_EDITOR_CONTEXT_MENU.refactor.id, items: [{ order: 20, command: `${id}.leaveAnExcuse` }] },
          {
            id: `${id}.reactions`,
            order: 50,
            items: [
              { order: 10, command: `${id}.shrug` },
              { order: 20, command: `${id}.flipTheTable` },
              { order: 30, command: `${id}.rollAD20` },
            ],
          },
          { id: `${id}.tone`, order: 60, items: [{ label: 'Tone of voice', submenu: `${id}.tone` }] },
          {
            id: `${id}.tones`,
            in: `${id}.tone`,
            items: [
              { order: 10, command: `${id}.uwu` },
              { order: 20, command: `${id}.vaporwave` },
              { order: 30, command: `${id}.mocking` },
            ],
          },
        ]),
      ];
    },
  };
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
