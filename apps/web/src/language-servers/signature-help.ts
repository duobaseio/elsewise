import { highlightingFor, language } from '@codemirror/language';
import { LSPPlugin } from '@codemirror/lsp-client';
import { type Extension, Prec, StateEffect, StateField } from '@codemirror/state';
import { type EditorView, keymap, showTooltip, type Tooltip, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { highlightCode } from '@lezer/highlight';
import {
  type SignatureHelp,
  type SignatureHelpContext,
  type SignatureHelpParams,
  SignatureHelpTriggerKind,
} from 'vscode-languageserver-protocol';

/**
 * The signatures shown, and the tooltip that shows them.
 */
interface Signatures {
  data: SignatureHelp;
  tooltip: Tooltip;
}

// Copied from `@codemirror/lsp-client`'s `signatureState`.
//
// Has no active signature, since every signature is shown.
const signatures = StateField.define<Signatures | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSignatures)) {
        if (effect.value === null) {
          return null;
        }

        const { data, pos } = effect.value;
        return { data, tooltip: { pos, above: true, create: (view) => draw(view, data) } };
      }
    }

    if (value && tr.docChanged) {
      return { ...value, tooltip: { ...value.tooltip, pos: tr.changes.mapPos(value.tooltip.pos) } };
    }
    return value;
  },
  provide: (field) => showTooltip.from(field, (value) => value?.tooltip ?? null),
});

const setSignatures = StateEffect.define<{ data: SignatureHelp; pos: number } | null>();

/**
 * Returns the extension that shows the signatures of the call at the cursor, with the parameter the cursor is in.
 *
 * It replaces `@codemirror/lsp-client`'s `signatureHelp()`, which shows one signature at a time as plain text.
 */
export function serverSignatureHelp(): Extension {
  return [
    signatures,
    requests,
    Prec.high(
      keymap.of([
        { key: 'Mod-Shift-Space', run: showSignatureHelp },
        {
          key: 'Escape',
          run: (view) => {
            if (!view.state.field(signatures)) {
              return false;
            }

            view.dispatch({ effects: setSignatures.of(null) });
            return true;
          },
        },
      ]),
    ),
  ];
}

// Copied from `@codemirror/lsp-client`'s `signaturePlugin`.
//
// Also updates when the active parameter of a signature other than the active one changes, since every signature is
// shown, and reports errors in a toast.
const requests = ViewPlugin.fromClass(
  class {
    request: { pos: number; drop: boolean } | null = null;
    delayed: ReturnType<typeof setTimeout> | undefined;

    update(update: ViewUpdate) {
      if (this.request) {
        if (update.selectionSet) {
          this.request.drop = true;
          this.request = null;
        } else if (update.docChanged) {
          this.request.pos = update.changes.mapPos(this.request.pos);
        }
      }

      const plugin = LSPPlugin.get(update.view);
      if (!plugin) {
        return;
      }

      const shown = update.view.state.field(signatures);
      let character = '';
      if (update.docChanged && update.transactions.some((tr) => tr.isUserEvent('input.type'))) {
        const provider = plugin.client.serverCapabilities?.signatureHelpProvider;
        const triggers = [...(provider?.triggerCharacters ?? []), ...((shown && provider?.retriggerCharacters) || [])];
        update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
          const text = inserted.toString();
          for (const trigger of triggers) {
            if (text.includes(trigger)) {
              character = trigger;
            }
          }
        });
      }

      if (character) {
        this.start(plugin, {
          triggerKind: SignatureHelpTriggerKind.TriggerCharacter,
          isRetrigger: !!shown,
          triggerCharacter: character,
          activeSignatureHelp: shown?.data,
        });
      } else if (shown && update.selectionSet) {
        clearTimeout(this.delayed);
        this.delayed = setTimeout(() => {
          this.start(plugin, {
            triggerKind: SignatureHelpTriggerKind.ContentChange,
            isRetrigger: true,
            activeSignatureHelp: shown.data,
          });
        }, 250);
      }
    }

    start(plugin: LSPPlugin, context: SignatureHelpContext) {
      clearTimeout(this.delayed);
      const { view } = plugin;
      const pos = view.state.selection.main.head;
      if (this.request) {
        this.request.drop = true;
      }
      const request = { pos, drop: false };
      this.request = request;

      let help: Promise<SignatureHelp | null> = Promise.resolve(null);
      if (plugin.client.serverCapabilities?.signatureHelpProvider) {
        plugin.client.sync();
        help = plugin.client.request<SignatureHelpParams, SignatureHelp | null>('textDocument/signatureHelp', {
          context,
          position: plugin.toPosition(pos),
          textDocument: { uri: plugin.uri },
        });
      }

      help.then(
        (result) => {
          if (request.drop) {
            return;
          }

          const shown = view.state.field(signatures);
          if (result?.signatures.length) {
            const same = shown !== null && sameSignatures(shown.data, result);
            if (same && sameActive(shown.data, result)) {
              return;
            }
            view.dispatch({
              effects: setSignatures.of({ data: result, pos: same ? shown.tooltip.pos : request.pos }),
            });
          } else if (shown) {
            view.dispatch({ effects: setSignatures.of(null) });
          }
        },
        context.triggerKind === SignatureHelpTriggerKind.Invoked
          ? (error) =>
              toast.add({ type: 'error', title: 'Signature help failed', description: (error as Error).message })
          : undefined,
      );
    }

    destroy() {
      clearTimeout(this.delayed);
      if (this.request) {
        this.request.drop = true;
      }
    }
  },
);

// Copied from `@codemirror/lsp-client`'s `showSignatureHelp`.
//
// Doesn't add the extension when missing.
function showSignatureHelp(view: EditorView): boolean {
  const requester = view.plugin(requests);
  const plugin = LSPPlugin.get(view);
  if (!requester || !plugin) {
    return false;
  }

  const shown = view.state.field(signatures);
  requester.start(plugin, {
    triggerKind: SignatureHelpTriggerKind.Invoked,
    activeSignatureHelp: shown?.data,
    isRetrigger: !!shown,
  });
  return true;
}

// Copied from `@codemirror/lsp-client`'s `sameSignatures`.
function sameSignatures(a: SignatureHelp, b: SignatureHelp): boolean {
  return (
    a.signatures.length === b.signatures.length &&
    a.signatures.every((signature, i) => signature.label === b.signatures[i].label)
  );
}

// Based on `@codemirror/lsp-client`'s `sameActiveParam`, which only compares the active parameter of the signature it
// shows.
function sameActive(a: SignatureHelp, b: SignatureHelp): boolean {
  return (
    a.activeParameter === b.activeParameter &&
    a.signatures.every((signature, i) => signature.activeParameter === b.signatures[i].activeParameter)
  );
}

// Based on `@codemirror/lsp-client`'s `drawSignatureTooltip`, which draws the selected signature alone, unhighlighted,
// with its documentation.
function draw(view: EditorView, data: SignatureHelp): { dom: HTMLElement } {
  const dom = document.createElement('div');
  dom.className = 'cm-lsp-signatures';
  const list = dom.appendChild(document.createElement('ul'));

  const current = view.state.facet(language);
  for (const signature of data.signatures) {
    const { label, parameters = [] } = signature;
    const row = list.appendChild(document.createElement('li'));

    const ranges: ([from: number, to: number] | null)[] = [];
    for (const { label: text } of parameters) {
      if (typeof text !== 'string') {
        ranges.push(text);
        continue;
      }

      const start = ranges.findLast((range) => range !== null)?.[1] ?? 0;
      const match = new RegExp(`(?<!\\w)${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`).exec(
        label.slice(start),
      );
      ranges.push(match && text ? [start + match.index, start + match.index + text.length] : null);
    }

    const index = signature.activeParameter === undefined ? data.activeParameter : signature.activeParameter;
    const marked = index == null ? null : (ranges[index] ?? null);
    if (index != null && index >= Math.max(parameters.length, 1)) {
      row.classList.add('cm-lsp-signature-inapplicable');
    }

    // The space after each parameter, where the row may wrap.
    const breaks = new Set<number>();
    const found = ranges.filter((range) => range !== null);
    for (const [j, [, to]] of found.entries()) {
      const space = label.slice(to).search(/\s/);
      if (space !== -1 && to + space < (found[j + 1]?.[0] ?? label.length)) {
        breaks.add(to + space);
      }
    }

    const pieces: [from: number, to: number, classes: string][] = [];
    if (current === null) {
      pieces.push([0, label.length, '']);
    } else {
      const end = () => pieces.at(-1)?.[1] ?? 0;
      highlightCode(
        label,
        current.parser.parse(label),
        { style: (tags) => highlightingFor(view.state, tags) },
        (text, classes) => pieces.push([end(), end() + text.length, classes]),
        () => pieces.push([end(), end() + 1, '']),
      );
    }

    // Puts the text between the breaks in parts that don't wrap, and the active parameter in a span of its own.
    const cuts = [...[...breaks].flatMap((at) => [at, at + 1]), ...(marked ?? [])];
    let part: HTMLElement | null = null;
    let parameter: HTMLElement | null = null;
    for (const [from, to, classes] of pieces) {
      const stops = [from, ...cuts.filter((cut) => cut > from && cut < to).sort((a, b) => a - b), to];
      for (let j = 0; j + 1 < stops.length; j++) {
        const text = label.slice(stops[j], stops[j + 1]);
        if (breaks.has(stops[j])) {
          row.append(text);
          part = parameter = null;
          continue;
        }

        part ??= row.appendChild(Object.assign(document.createElement('span'), { className: 'cm-lsp-signature-part' }));
        let parent = part;
        if (marked && stops[j] >= marked[0] && stops[j] < marked[1]) {
          parameter ??= part.appendChild(
            Object.assign(document.createElement('span'), { className: 'cm-lsp-active-parameter' }),
          );
          parent = parameter;
        } else {
          parameter = null;
        }

        if (classes === '') {
          parent.append(text);
        } else {
          parent.appendChild(Object.assign(document.createElement('span'), { className: classes, textContent: text }));
        }
      }
    }
  }

  return { dom };
}
