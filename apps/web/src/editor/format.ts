import { diff } from '@codemirror/merge';
import { ChangeSet, type EditorState, StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { DEFAULT_COMMANDS, DEFAULT_KEYS, type EditorCommand, type EditorFormatter } from '@elsewise/plugin';

/**
 * The edits made since each pending {@link EDITOR_FORMAT} started, which its formatter's changes are mapped through.
 */
export const format = StateField.define<ReadonlyMap<object, ChangeSet>>({
  create: () => new Map(),
  update(value, tr) {
    if (!tr.effects.some((effect) => effect.is(trackEdits)) && (!tr.docChanged || value.size === 0)) {
      return value;
    }

    const next = new Map(
      [...value].map(([request, changes]) => [request, tr.docChanged ? changes.compose(tr.changes) : changes]),
    );
    for (const effect of tr.effects) {
      if (effect.is(trackEdits)) {
        if (effect.value.track) {
          next.set(effect.value.request, ChangeSet.empty(tr.state.doc.length));
        } else {
          next.delete(effect.value.request);
        }
      }
    }
    return next;
  },
});

const trackEdits = StateEffect.define<{ request: object; track: boolean }>();

export const EDITOR_FORMAT: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.edit.format,
  label: 'Format',
  defaultKeys: DEFAULT_KEYS.editor.edit.format,
  // Formats only the selection when there is one, with the first formatter that is enabled.
  enabled: (_, view) => !view.state.readOnly && find(view).formatter !== undefined,
  shown: (_, view) => formatters(view.state).length > 0,
  run(_, view) {
    const { formatter, ranges } = find(view);
    if (formatter === undefined) {
      return false;
    }

    const request = {};
    view.dispatch({ effects: trackEdits.of({ request, track: true }) });
    const { doc } = view.state;
    void (async () => {
      try {
        const result = await formatter.format(view, ranges);
        const edited = view.state.field(format).get(request);
        if (edited === undefined) {
          return;
        }

        const changes: { from: number; to: number; insert: string }[] = [];
        for (const change of result) {
          const parts = diff(doc.sliceString(change.from, change.to), change.insert, { scanLimit: 500 });
          for (const { fromA, toA, fromB, toB } of parts) {
            const [from, to] = [change.from + fromA, change.from + toA];
            if (edited.touchesRange(from, to)) {
              return;
            }

            changes.push({
              from: edited.mapPos(from, 1),
              to: edited.mapPos(to, -1),
              insert: change.insert.slice(fromB, toB),
            });
          }
        }

        // Keeps the first of overlapping changes. Two selections can both change the code between them.
        const kept: typeof changes = [];
        for (const change of changes.sort((a, b) => a.from - b.from || a.to - b.to)) {
          const last = kept.at(-1);
          if (!last || change.from > last.to || (change.from === last.to && change.from !== last.from)) {
            kept.push(change);
          }
        }
        view.dispatch({ changes: kept, userEvent: 'format' });
      } catch (error) {
        toast.add({ type: 'error', title: 'Formatting failed', description: (error as Error).message });
      } finally {
        view.dispatch({ effects: trackEdits.of({ request, track: false }) });
      }
    })();
    return true;
  },
};

// Returns the selection's ranges, and the first formatter enabled for them.
function find(view: EditorView): {
  formatter: EditorFormatter | undefined;
  ranges: readonly { from: number; to: number }[] | undefined;
} {
  const selection = view.state.selection.ranges.filter((range) => !range.empty).map(({ from, to }) => ({ from, to }));
  const ranges = selection.length > 0 ? selection : undefined;
  return { formatter: formatters(view.state).find((formatter) => formatter.enabled?.(view, ranges) ?? true), ranges };
}

function formatters(state: EditorState): readonly EditorFormatter[] {
  return state
    .languageDataAt<EditorFormatter>('formatter', 0)
    .toSorted((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || 0);
}
