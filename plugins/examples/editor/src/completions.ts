import {
  type CompletionContext,
  type CompletionResult,
  insertCompletionText,
  pickedCompletion,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { EditorCompletion } from '@elsewise/plugin';
import { tags } from '@lezer/highlight';

/**
 * An extension that completes reactions in every file, e.g. `:shrug:` after typing `:sh`.
 */
export const reactions = EditorState.languageData.of(() => [{ autocomplete: completeReactions }]);

/**
 * Completes the common keys of a `.env` file at the start of a line.
 */
export function keys(context: CompletionContext): CompletionResult | null {
  const key = context.matchBefore(/^\w*/);
  if (key === null || (key.from === key.to && !context.explicit)) {
    return null;
  }

  return { from: key.from, options: KEYS, validFor: /^\w*$/ };
}

function completeReactions(context: CompletionContext): CompletionResult | null {
  // Waits for a letter after the colon, so that a colon in code does not open the list.
  const reaction = context.matchBefore(/:\w*/);
  if (reaction === null || (reaction.to - reaction.from < 2 && !context.explicit)) {
    return null;
  }

  return { from: reaction.from, options: REACTIONS, validFor: /^:\w*$/ };
}

const svg = (markup: string) => `data:image/svg+xml,${encodeURIComponent(markup)}`;

// A face with its own colors, drawn as it is.
const FACE = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="7" fill="#f5c542"/>' +
    '<circle cx="5.5" cy="6.5" r="1" fill="#3b2f1e"/>' +
    '<circle cx="10.5" cy="6.5" r="1" fill="#3b2f1e"/>' +
    '<path d="M5 10.5h6" stroke="#3b2f1e" stroke-width="1.2" stroke-linecap="round"/>' +
    '</svg>',
);

// A table, drawn in the tag's color.
const TABLE = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1 4h14v2H1zM3 6h2v7H3zM11 6h2v7h-2z"/></svg>',
);

const FLIP = '(╯°□°)╯︵ ┻━┻';

const REACTIONS: readonly EditorCompletion[] = [
  { label: ':shrug:', icon: { image: FACE }, tail: ' ¯\\_(ツ)_/¯', apply: '¯\\_(ツ)_/¯' },
  { label: ':flip:', icon: { svg: TABLE, tag: tags.keyword }, apply: FLIP },
  { label: ':tableflip:', icon: { svg: TABLE }, deprecated: true, detail: 'use :flip:', apply: FLIP },
  {
    label: ':d20:',
    icon: { letters: 'd', tag: tags.number },
    detail: '1–20',
    // Rolls when picked rather than when listed.
    apply: (view, completion, from, to) =>
      view.dispatch(insertCompletionText(view.state, String(1 + Math.floor(Math.random() * 20)), from, to), {
        annotations: pickedCompletion.of(completion),
      }),
  },
  // Without an icon, the editor shows the type's.
  { label: ':lenny:', type: 'text', apply: '( ͡° ͜ʖ ͡°)' },
];

const KEYS: readonly EditorCompletion[] = [
  { label: 'NODE_ENV', icon: { letters: 'E', tag: tags.propertyName }, detail: 'development | production' },
  { label: 'PORT', icon: { letters: 'E', tag: tags.propertyName }, detail: '3000' },
  { label: 'LOG_LEVEL', icon: { letters: 'E', tag: tags.propertyName }, detail: 'debug | info | warn | error' },
  { label: 'DEBUG', icon: { letters: 'E', tag: tags.propertyName }, deprecated: true, detail: 'use LOG_LEVEL' },
  { label: 'DATABASE_URL', icon: { letters: 'S', tag: tags.string }, detail: 'secret' },
  { label: 'API_KEY', icon: { letters: 'S', tag: tags.string }, detail: 'secret' },
];
