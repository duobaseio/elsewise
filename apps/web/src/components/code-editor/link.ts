import { highlightingFor } from '@codemirror/language';
import { type Extension, Prec } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { OS } from '@elsewise/components/lib/os';
import { tags } from '@lezer/highlight';
import { hint } from '@/language-servers/hint';

interface Link {
  from: number;
  to: number;
  url: string;
}

const MATCHER = new MatchDecorator({
  // Stops at whitespace, quotes and brackets, which delimit a URL in code, and leaves out the punctuation that ends a
  // sentence.
  regexp: /https?:\/\/[^\s"'`<>()[\]{}]*[^\s"'`<>()[\]{}.,;:!?]/g,
  decoration: Decoration.mark({ class: 'cm-link' }),
});


/**
 * Returns the extension that underlines URLs and opens the one under the pointer on ⌘-click, or Ctrl-click off a Mac.
 *
 * Hovering over a URL shows the key in a tooltip, and holding the key shows the URL as a link.
 */
export function link(): Extension {
  return [
    // Puts the underline inside the syntax highlighting, which it takes its color from.
    Prec.highest(LINKS),
    hoverTooltip((view, pos, side) => {
      const link = view.plugin(LINKS)?.linkAt(side < 0 ? pos - 1 : pos);
      if (link == null) {
        return null;
      }

      return {
        pos: link.from,
        end: link.to,
        above: true,
        create: () => ({ dom: hint('cm-link-hint', [['Mod-Click', 'open in browser']]) }),
      };
    }),
    EditorView.theme({
      '.cm-link': { textDecoration: 'underline' },
      '.cm-link-active': { textDecoration: 'underline', cursor: 'pointer' },
    }),
  ];
}

const LINKS = ViewPlugin.fromClass(
  class {
    links: DecorationSet;
    active: DecorationSet = Decoration.none;
    private hovered: Link | null = null;
    private pointer: { x: number; y: number } | null = null;

    constructor(private readonly view: EditorView) {
      this.links = MATCHER.createDeco(view);
    }

    update(update: ViewUpdate): void {
      this.links = MATCHER.updateDeco(update, this.links);
      if (update.docChanged) {
        this.hovered = null;
        this.active = Decoration.none;
      }
    }

    /**
     * Returns the link that the character at `pos` is in.
     */
    linkAt(pos: number): Link | null {
      for (const cursor = this.links.iter(pos); cursor.value !== null && cursor.from <= pos; cursor.next()) {
        if (pos < cursor.to) {
          return { from: cursor.from, to: cursor.to, url: this.view.state.sliceDoc(cursor.from, cursor.to) };
        }
      }
      return null;
    }

    /**
     * Shows the link under the pointer as a link if the key is held, and as a plain URL otherwise.
     */
    hover(event: MouseEvent | KeyboardEvent): void {
      if (event instanceof MouseEvent) {
        this.pointer = event.type === 'mouseleave' ? null : { x: event.clientX, y: event.clientY };
      }

      const link = this.pointer !== null && this.held(event) ? this.linkUnder(this.pointer) : null;
      if (link?.from === this.hovered?.from && link?.to === this.hovered?.to) {
        return;
      }

      this.hovered = link;
      // Styled as the theme styles the links that the grammar finds, e.g. in Markdown.
      const style = highlightingFor(this.view.state, [tags.link]) ?? '';
      const active = Decoration.mark({ class: `cm-link-active ${style}` });
      this.active = link === null ? Decoration.none : Decoration.set(active.range(link.from, link.to));
      this.view.update([]);
    }

    /**
     * Opens the link under the pointer if the key is held. Returns whether it did.
     */
    open(event: MouseEvent): boolean {
      const link =
        event.button === 0 && this.held(event) ? this.linkUnder({ x: event.clientX, y: event.clientY }) : null;
      if (link === null) {
        return false;
      }

      // The desktop opens it in the default browser.
      window.open(link.url, '_blank', 'noopener');
      return true;
    }

    private held(event: MouseEvent | KeyboardEvent): boolean {
      return OS === 'mac' ? event.metaKey : event.ctrlKey;
    }

    private linkUnder(coords: { x: number; y: number }): Link | null {
      const target = this.view.posAndSideAtCoords(coords);
      if (target === null) {
        return null;
      }

      // Past the end of a line, the pointer is over the line break, which has no box.
      const char = target.assoc < 0 ? target.pos - 1 : target.pos;
      const box = char < 0 ? null : this.view.coordsForChar(char);
      if (box === null || coords.x < box.left || coords.x > box.right) {
        return null;
      }

      return this.linkAt(char);
    }
  },
  {
    decorations: (plugin) => plugin.links,
    provide: (plugin) => EditorView.decorations.of((view) => view.plugin(plugin)?.active ?? Decoration.none),
    eventHandlers: {
      mousedown(event) {
        return this.open(event);
      },
    },
    eventObservers: {
      mousemove(event) {
        this.hover(event);
      },
      mouseleave(event) {
        this.hover(event);
      },
      keydown(event) {
        this.hover(event);
      },
      keyup(event) {
        this.hover(event);
      },
    },
  },
);
