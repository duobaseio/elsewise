import { type Extension, Facet } from '@codemirror/state';
import { type EditorView, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { EditorDiagnostic } from '@elsewise/plugin';
import { diagnostics, SEVERITIES } from '@/editor/diagnostics';
import { diagnosticsSection } from '@/editor/hover';
import { jump } from '@/editor/scroll';
import { SCROLLBAR_MARKER_MIN_HEIGHT, SCROLLBAR_MARKER_TOLERANCE } from '@/editor/theme';

const KINDS = ['hint', 'info', 'warning', 'error', 'usage', 'searchMatch'] as const;

export type ScrollbarMarkerKind = (typeof KINDS)[number];

export interface ScrollbarMarker {
  readonly from: number;
  readonly to: number;
  readonly kind: ScrollbarMarkerKind;
  readonly diagnostic?: EditorDiagnostic;
}

export const scrollbarMarkerSources = Facet.define<ScrollbarMarkerSource>();

export interface ScrollbarMarkerSource {
  update(update: ViewUpdate): boolean;
  markers(view: EditorView): readonly ScrollbarMarker[];
}

/**
 * Returns the extension that draws markers over the vertical scrollbar: one for each diagnostic, and those the
 * {@link scrollbarMarkerSources} add. Pointing at a diagnostic's marker shows it like the hover does, and clicking a
 * marker jumps to its range.
 */
export function scrollbarMarkers(): Extension {
  return [
    scrollbarMarkerSources.of({
      update: (update) => update.state.field(diagnostics) !== update.startState.field(diagnostics),
      markers: (view) =>
        view.state
          .field(diagnostics)
          .map((diagnostic) => ({ from: diagnostic.from, to: diagnostic.to, kind: diagnostic.severity, diagnostic })),
    }),
    painter,
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          const plugin = view.plugin(painter);
          if (!plugin?.tooltip) {
            return false;
          }
          plugin.hide();
          return true;
        },
      },
    ]),
  ];
}

interface Layout {
  readonly top: number;
  readonly height: number;
  readonly positioned: PositionedMarker[];
}

interface PositionedMarker {
  readonly top: number;
  readonly bottom: number;
  readonly marker: ScrollbarMarker;
}

const painter = ViewPlugin.fromClass(
  class {
    readonly dom: HTMLElement;
    /**
     * The tooltip for the markers under the pointer, if shown.
     */
    tooltip: HTMLElement | null = null;
    private readonly cache = new Map<ScrollbarMarkerSource, PositionedMarker[] | null>();
    private moved = true;
    private positioned: PositionedMarker[] = [];
    /**
     * The messages the tooltip shows, which the pointer resting on the same markers keeps.
     */
    private shown: string | null = null;
    private hiding: ReturnType<typeof setTimeout> | undefined;
    /**
     * Whether the pointer is over the tooltip, which keeps it.
     */
    private over = false;
    private readonly measure: { read: () => Layout; write: (layout: Layout) => void };

    constructor(private readonly view: EditorView) {
      this.dom = view.dom.appendChild(document.createElement('div'));
      this.dom.className = 'cm-scrollbar-markers';
      this.dom.addEventListener('mousemove', this.point);
      this.dom.addEventListener('mouseleave', this.leave);
      // Prevents clicking a marker from causing the highlight to be unfocused.
      this.dom.addEventListener('mousedown', (event) => event.preventDefault());
      this.dom.addEventListener('click', this.click);
      this.measure = { read: () => this.layout(), write: (layout) => this.draw(layout) };
      view.requestMeasure(this.measure);
    }

    update(update: ViewUpdate) {
      const moved = update.docChanged || update.heightChanged || update.geometryChanged;
      let stale = update.docChanged;

      const sources = update.state.facet(scrollbarMarkerSources);
      if (sources !== update.startState.facet(scrollbarMarkerSources)) {
        this.cache.clear();
        stale = true;
      }

      for (const source of sources) {
        if (!this.cache.has(source) || source.update(update)) {
          this.cache.set(source, null);
          stale = true;
        }
      }

      if (stale) {
        this.hide();
      }

      if (moved) {
        this.moved = true;
      }

      if (moved || stale) {
        update.view.requestMeasure(this.measure);
      }
    }

    destroy() {
      this.hide();
      this.dom.remove();
    }

    /**
     * Hides the tooltip.
     */
    hide() {
      clearTimeout(this.hiding);
      this.tooltip?.remove();
      this.tooltip = null;
      this.shown = null;
      this.over = false;
    }

    // Jumps to the nearest marker, unfolding it if folded.
    private readonly click = (event: MouseEvent) => {
      const y = event.clientY - this.dom.getBoundingClientRect().top;
      const nearest = this.at(y)[0];
      if (nearest === undefined) {
        return;
      }

      jump(this.view, nearest.marker);
      this.view.focus();
      this.hide();
      // Keeps the jump from being read as a click in the code.
      event.stopPropagation();
    };

    private layout(): Layout {
      const { view } = this;
      const { scrollDOM } = view;
      const sources = view.state.facet(scrollbarMarkerSources);
      const height = scrollDOM.clientHeight;
      const scale = scrollDOM.scrollHeight > height ? height / scrollDOM.scrollHeight : 1;
      const padding = view.documentPadding.top;

      const position = (marker: ScrollbarMarker): PositionedMarker => {
        const top = (view.lineBlockAt(marker.from).top + padding) * scale;
        const bottom = (view.lineBlockAt(marker.to).top + padding) * scale;
        return { top, bottom: Math.max(bottom, top + SCROLLBAR_MARKER_MIN_HEIGHT), marker };
      };

      const positioned: PositionedMarker[] = [];
      for (const source of sources) {
        const cached = this.cache.get(source);
        const placed = cached
          ? this.moved
            ? cached.map(({ marker }) => position(marker))
            : cached
          : source.markers(view).map(position);
        this.cache.set(source, placed);
        positioned.push(...placed);
      }
      this.moved = false;
      return { top: scrollDOM.offsetTop, height, positioned };
    }

    // Draws the markers, by kind from the lowest layer up, with adjacent markers of a kind merged into one element.
    private draw({ top, height, positioned }: Layout) {
      this.positioned = positioned;
      this.dom.style.top = `${top}px`;
      this.dom.style.height = `${height}px`;
      this.dom.replaceChildren();
      for (const kind of KINDS) {
        const runs = positioned
          .filter(({ marker }) => marker.kind === kind)
          .sort((a, b) => a.top - b.top)
          .reduce<{ top: number; bottom: number }[]>((runs, { top, bottom }) => {
            const last = runs.at(-1);
            if (last && top <= last.bottom) {
              last.bottom = Math.max(last.bottom, bottom);
            } else {
              runs.push({ top, bottom });
            }
            return runs;
          }, []);
        for (const run of runs) {
          const element = this.dom.appendChild(document.createElement('div'));
          element.className = `cm-scrollbar-marker cm-scrollbar-marker-${kind}`;
          element.style.top = `${run.top - SCROLLBAR_MARKER_TOLERANCE}px`;
          element.style.height = `${run.bottom - run.top + 2 * SCROLLBAR_MARKER_TOLERANCE}px`;
        }
      }
    }

    private readonly point = (event: MouseEvent) => {
      clearTimeout(this.hiding);
      const y = event.clientY - this.dom.getBoundingClientRect().top;
      const near = this.at(y);
      // Dropping duplicate messages, highest severity first.
      const seen = new Set<string>();
      const diagnostics = near
        .flatMap(({ marker }) => marker.diagnostic ?? [])
        .filter((diagnostic) => !seen.has(diagnostic.message) && seen.add(diagnostic.message))
        .sort(
          (a, b) =>
            SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.message.localeCompare(b.message),
        );
      const shown = diagnostics.map(({ message }) => message).join('\n');
      if (diagnostics.length === 0) {
        this.hide();
        return;
      }
      if (shown === this.shown) {
        return;
      }
      this.shown = shown;

      const anchor = near[0];
      void diagnosticsSection(this.view, diagnostics).then((dom) => {
        if (dom === null || this.shown !== shown) {
          return;
        }
        this.tooltip?.remove();
        const tooltip = this.view.dom.appendChild(document.createElement('div'));
        tooltip.className = 'cm-tooltip cm-tooltip-hover cm-scrollbar-marker-tooltip';
        tooltip.appendChild(dom).classList.add('cm-tooltip-section');
        tooltip.addEventListener('mouseenter', () => {
          this.over = true;
          clearTimeout(this.hiding);
        });
        tooltip.addEventListener('mouseleave', () => {
          this.over = false;
          this.leave();
        });
        // A fix or the actions take over from the tooltip.
        tooltip.addEventListener('click', (event) => {
          if ((event.target as Element).closest('button')) {
            this.hide();
          }
        });
        this.tooltip = tooltip;

        // Centred on the marker, within the editor.
        const middle = this.dom.offsetTop + (anchor.top + anchor.bottom) / 2;
        const room = this.view.dom.clientHeight - tooltip.offsetHeight;
        tooltip.style.top = `${Math.max(0, Math.min(middle - tooltip.offsetHeight / 2, room))}px`;
      });
    };

    // Hides the tooltip shortly after the pointer leaves a marker, unless it reached the tooltip.
    private readonly leave = () => {
      clearTimeout(this.hiding);
      this.hiding = setTimeout(() => {
        if (!this.over) {
          this.hide();
        }
      }, 150);
    };

    private at(y: number): PositionedMarker[] {
      return this.positioned
        .filter(
          (marker) => y >= marker.top - SCROLLBAR_MARKER_TOLERANCE && y <= marker.bottom + SCROLLBAR_MARKER_TOLERANCE,
        )
        .sort((a, b) => Math.abs(a.top - y) - Math.abs(b.top - y));
    }
  },
);
