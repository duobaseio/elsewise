import { acceptCompletion, autocompletion, completionStatus, pickedCompletion } from '@codemirror/autocomplete';
import { highlightingFor } from '@codemirror/language';
import { CharCategory, EditorState, type Extension, Facet, Prec, StateEffect, StateField } from '@codemirror/state';
import { type EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { letterformClass } from '@elsewise/components/components/letter-icon';
import { cn } from '@elsewise/components/lib/utils';
import type { EditorCompletion } from '@elsewise/plugin';
import { type Tag, tags as t } from '@lezer/highlight';
import { hint } from '@/editor/tooltip';

/**
 * The letters of each completion type's letterform, and the syntax tag it is colored like. Types are uppercase, values
 * lowercase. CodeMirror's own types are included for completions that come from elsewhere.
 */
const LETTERFORMS = new Map<string, readonly [letters: string, tag: Tag | null]>([
  ['class', ['C', t.typeName]],
  ['struct', ['S', t.typeName]],
  ['interface', ['I', t.typeName]],
  ['enum', ['E', t.typeName]],
  ['type-parameter', ['T', t.typeName]],
  ['type', ['T', t.typeName]],
  ['module', ['M', t.namespace]],
  ['namespace', ['M', t.namespace]],
  ['method', ['m', t.function(t.propertyName)]],
  ['function', ['f', t.function(t.variableName)]],
  ['constructor', ['f', t.function(t.variableName)]],
  ['field', ['p', t.propertyName]],
  ['property', ['p', t.propertyName]],
  ['variable', ['v', t.variableName]],
  ['value', ['v', t.variableName]],
  ['constant', ['c', t.constant(t.name)]],
  ['enum-member', ['e', t.constant(t.name)]],
  ['keyword', ['k', t.keyword]],
  ['snippet', ['{}', null]],
]);

const OTHER = ['t', null] as const;

/**
 * Whether completions show the selected item's documentation beside the list, true unless set.
 */
export const completionDocumentation = Facet.define<boolean, boolean>({ combine: (values) => values.at(-1) ?? true });
/**
 * Whether the next picked completion replaces the rest of the word after the cursor.
 */
const replacing = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => tr.effects.find((effect) => effect.is(setReplacing))?.value ?? value,
});

const setReplacing = StateEffect.define<boolean>();

/**
 * Returns the extension that shows the completions of every source, and picks one over the rest of the word with Tab.
 */
export function completion(): Extension {
  return [
    autocompletion({
      icons: false,
      addToOptions: [
        { position: 20, render: icon },
        { position: 51, render: tail },
      ],
      optionClass: (completion: EditorCompletion) => (completion.deprecated ? 'cm-completion-deprecated' : ''),
      tooltipClass: (state) => (state.facet(completionDocumentation) ? '' : 'cm-completion-undocumented'),
    }),
    replacing,
    // Adds the hint below the list, once the tooltip is drawn.
    ViewPlugin.define((view) => ({
      update(update) {
        if (completionStatus(update.state) !== 'active') {
          return;
        }
        view.requestMeasure({
          read: () => view.dom.querySelector('.cm-tooltip-autocomplete'),
          write: (tooltip) => {
            if (tooltip && !tooltip.querySelector(':scope > .cm-completion-hint')) {
              tooltip.append(
                hint('cm-completion-hint', [
                  ['Enter', 'insert'],
                  ['Tab', 'replace'],
                ]),
              );
            }
          },
        });
      },
    })),
    Prec.highest(keymap.of([{ key: 'Tab', run: replace }])),
    EditorState.transactionFilter.of((tr) => {
      if (!tr.startState.field(replacing) || !tr.annotation(pickedCompletion)) {
        return tr;
      }

      const state = tr.startState;
      const pos = state.selection.main.head;
      const word = state.charCategorizer(pos);
      let end = pos;
      while (end < state.doc.lineAt(pos).to && word(state.sliceDoc(end, end + 1)) === CharCategory.Word) {
        end++;
      }

      const changes = end === pos ? [] : { from: tr.changes.mapPos(pos, 1), to: tr.changes.mapPos(end, 1) };
      return [tr, { changes, effects: setReplacing.of(false), sequential: true }];
    }),
  ];
}

function icon(completion: EditorCompletion, state: EditorState): Node {
  const custom = completion.icon;
  if (custom !== undefined && 'image' in custom) {
    const image = Object.assign(document.createElement('img'), { src: custom.image, alt: '' });
    image.className = 'cm-completionKind size-4 object-contain';
    return image;
  }

  const dom = document.createElement('span');
  if (custom !== undefined && 'svg' in custom) {
    // Draws only the SVG's shape, in the icon's color.
    dom.className = cn('cm-completionKind size-4 bg-current', custom.tag && highlightingFor(state, [custom.tag]));
    dom.style.mask = `url(${JSON.stringify(custom.svg)}) center / contain no-repeat`;
    return dom;
  }

  const type = completion.type?.split(' ')[0];
  const [letters, tag] =
    custom !== undefined
      ? [custom.letters, custom.tag ?? null]
      : type === undefined
        ? [null, null]
        : (LETTERFORMS.get(type) ?? OTHER);
  if (letters === null) {
    dom.className = 'cm-completionKind';
    return dom;
  }

  const highlight = tag === null ? null : highlightingFor(state, [tag]);
  dom.className = cn(letterformClass(letters), 'cm-completionKind font-sans text-[11px]/none', highlight);
  dom.textContent = letters;
  dom.style.borderColor = 'color-mix(in srgb, currentColor 45%, transparent)';
  return dom;
}

function tail(completion: EditorCompletion): Node | null {
  if (!completion.tail) {
    return null;
  }

  const dom = document.createElement('span');
  dom.className = 'cm-completionTail';
  dom.textContent = completion.tail;
  return dom;
}

// Picks the selected completion over the rest of the word after the cursor.
function replace(view: EditorView): boolean {
  if (completionStatus(view.state) !== 'active') {
    return false;
  }

  view.dispatch({ effects: setReplacing.of(true) });
  const picked = acceptCompletion(view);
  // Clears it when nothing was picked, or a completion applied itself without saying so.
  if (view.state.field(replacing)) {
    view.dispatch({ effects: setReplacing.of(false) });
  }
  return picked;
}
