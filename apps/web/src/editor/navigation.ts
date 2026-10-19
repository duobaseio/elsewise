import { highlightingFor } from '@codemirror/language';
import { EditorState, type Extension, Prec } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { DEFAULT_NAVIGATION_SOURCES, type EditorNavigation, type EditorNavigationSource } from '@elsewise/plugin';
import { tags } from '@lezer/highlight';
import { hint } from '@/editor/tooltip';

// TODO: verify this. I wrote this late at night with AI assistance and I'm too tired to check all this.

const MATCHER = new MatchDecorator({
  // Stops at whitespace, quotes and brackets, which delimit a URL in code, and leaves out the punctuation that ends a
  // sentence.
  regexp: /https?:\/\/[^\s"'`<>()[\]{}]*[^\s"'`<>()[\]{}.,;:!?]/g,
  decoration: Decoration.mark({ class: 'cm-link' }),
});

const URL_SOURCE: EditorNavigationSource = {
  order: DEFAULT_NAVIGATION_SOURCES.url,
  navigation: (view, pos, side) => view.plugin(URLS)?.linkAt(side < 0 ? pos - 1 : pos) ?? null,
};

const a = 1;

/**
 * Returns the extension that underlines URLs and navigates from the code under the pointer on ⌘-click, or Ctrl-click
 * off a Mac. The navigation comes from the `navigation` language data, with the URLs at
 * {@link DEFAULT_NAVIGATION_SOURCES.url}.
 *
 * Hovering over a URL shows the key in a tooltip, and holding the key shows the navigation under the pointer as a link.
 */
export function navigation(): Extension {
  return [
    // Puts the underlines inside the syntax highlighting, which they take their color from.
    Prec.highest([URLS, NAVIGATION]),
    EditorState.languageData.of(() => [{ navigation: URL_SOURCE }]),
    hoverTooltip((view, pos, side) => {
      const link = view.plugin(URLS)?.linkAt(side < 0 ? pos - 1 : pos);
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

const URLS = ViewPlugin.fromClass(
  class {
    links: DecorationSet;

    constructor(private readonly view: EditorView) {
      this.links = MATCHER.createDeco(view);
    }

    update(update: ViewUpdate): void {
      this.links = MATCHER.updateDeco(update, this.links);
    }

    /**
     * Returns the link that the character at `pos` is in.
     */
    linkAt(pos: number): EditorNavigation | null {
      for (const cursor = this.links.iter(pos); cursor.value !== null && cursor.from <= pos; cursor.next()) {
        if (pos < cursor.to) {
          const url = this.view.state.sliceDoc(cursor.from, cursor.to);
          return { from: cursor.from, to: cursor.to, navigate: () => void window.open(url, '_blank', 'noopener') };
        }
      }
      return null;
    }
  },
  { decorations: (plugin) => plugin.links },
);

const NAVIGATION = ViewPlugin.fromClass(
  class {
    active: DecorationSet = Decoration.none;
    private pointer: { x: number; y: number } | null = null;
    // The range the pointer was last looked up in: the navigation found, or the word that had none. Nothing changes
    // while the pointer stays in it.
    private region: { from: number; to: number } | null = null;
    private navigation: EditorNavigation | null = null;
    // The lookups so far, to drop the answers of those that the pointer has moved on from.
    private request = 0;
    // The click that came before its lookup answered, replayed once it has.
    private clicked: MouseEvent | null = null;

    constructor(private readonly view: EditorView) {}

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.region = null;
        this.navigation = null;
        this.request++;
        this.clicked = null;
        this.active = Decoration.none;
      }
    }

    /**
     * Shows the navigation under the pointer as a link if the key is held, and as plain code otherwise.
     */
    hover(event: MouseEvent | KeyboardEvent): void {
      if (event instanceof MouseEvent) {
        this.pointer = event.type === 'mouseleave' ? null : { x: event.clientX, y: event.clientY };
      }

      const held = PLATFORM === 'mac' ? event.metaKey : event.ctrlKey;
      const target = this.pointer !== null && held ? this.under(this.pointer) : null;
      const char = target === null ? null : target.side < 0 ? target.pos - 1 : target.pos;
      if (char !== null && this.region !== null && this.region.from <= char && char < this.region.to) {
        return;
      }

      const request = ++this.request;
      this.clicked = null;
      if (this.navigation !== null) {
        this.navigation = null;
        this.mark();
      }

      if (target === null || char === null) {
        this.region = null;
        return;
      }

      const word = this.view.state.wordAt(char);
      this.region = word !== null && word.from <= char && char < word.to ? word : { from: char, to: char + 1 };
      void find(this.view, target.pos, target.side).then((navigation) => {
        if (request !== this.request) {
          return;
        }

        // Keeps the word when the navigation is off the character, so it isn't asked for again.
        this.navigation = navigation !== null && navigation.from <= char && char < navigation.to ? navigation : null;
        this.region = this.navigation ?? this.region;
        if (this.navigation !== null) {
          this.mark();
        }
        const clicked = this.clicked;
        this.clicked = null;
        if (clicked !== null) {
          this.open(clicked);
        }
      });
    }

    /**
     * Navigates from the code under the pointer if the key is held. Returns whether it did.
     *
     * A navigation still being looked up is followed once found, and the click is left to the editor meanwhile.
     */
    open(event: MouseEvent): boolean {
      if (event.button !== 0 || !(PLATFORM === 'mac' ? event.metaKey : event.ctrlKey)) {
        return false;
      }

      const target = this.under({ x: event.clientX, y: event.clientY });
      if (target === null) {
        return false;
      }

      const char = target.side < 0 ? target.pos - 1 : target.pos;
      if (this.navigation !== null && this.navigation.from <= char && char < this.navigation.to) {
        this.navigate(this.navigation);
        return true;
      }

      // Looks the navigation up if the click came first, and replays the click once found.
      const request = this.request;
      this.hover(event);
      this.clicked = this.request !== request && this.region !== null ? event : null;
      return false;
    }

    private navigate(navigation: EditorNavigation): void {
      Promise.try(() => navigation.navigate(this.view)).catch((error: unknown) => {
        toast.add({ type: 'error', title: 'Navigation failed', description: (error as Error).message });
      });
    }

    // Marks the navigation, or nothing without one.
    private mark(): void {
      // Styled as the theme styles the links that the grammar finds, e.g. in Markdown.
      const style = highlightingFor(this.view.state, [tags.link]) ?? '';
      const mark = Decoration.mark({ class: `cm-link-active ${style}` });
      this.active =
        this.navigation === null
          ? Decoration.none
          : Decoration.set(mark.range(this.navigation.from, this.navigation.to));
      this.view.update([]);
    }

    // Returns the position under `coords` and the side the pointer is on, or null off a character.
    private under(coords: { x: number; y: number }): { pos: number; side: -1 | 1 } | null {
      const target = this.view.posAndSideAtCoords(coords);
      if (target === null) {
        return null;
      }

      // Past the end of a line, the pointer is over the line break, which has no box.
      const side = target.assoc < 0 ? -1 : 1;
      const char = side < 0 ? target.pos - 1 : target.pos;
      const box = char < 0 ? null : this.view.coordsForChar(char);
      if (box === null || coords.x < box.left || coords.x > box.right) {
        return null;
      }

      return { pos: target.pos, side };
    }
  },
  {
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

async function find(view: EditorView, pos: number, side: -1 | 1): Promise<EditorNavigation | null> {
  const sources = view.state
    .languageDataAt<EditorNavigationSource>('navigation', pos, side)
    .toSorted((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || 0);
  const found = await Promise.all(
    sources.map((source) => Promise.try(() => source.navigation(view, pos, side)).catch(() => null)),
  );
  return found.find((navigation) => navigation !== null) ?? null;
}
