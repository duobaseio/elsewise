import { type Extension, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  MatchDecorator,
  showTooltip,
  type Tooltip,
  type TooltipView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/**
 * Returns an extension that shows a swatch before each six-digit hex color, e.g. `#1c2430`.
 *
 * Clicking a swatch opens a color picker that replaces the hex color in the document.
 */
export function colorPicker(): Extension {
  return [
    PICKER,
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = COLORS.createDeco(view);
        }

        update(update: ViewUpdate) {
          this.decorations = COLORS.updateDeco(update, this.decorations);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (view.state.field(PICKER) === null) {
            return false;
          }

          view.dispatch({ effects: TOGGLE.of(null) });
          return true;
        },
      },
    ]),
    THEME,
  ];
}

const HEX = /^#[0-9a-f]{6}$/i;

const COLORS = new MatchDecorator({
  regexp: /#[0-9a-f]{6}\b/gi,
  decorate: (add, from, _to, match) => add(from, from, Decoration.widget({ widget: new Swatch(match[0]), side: -1 })),
});

class Swatch extends WidgetType {
  constructor(private readonly color: string) {
    super();
  }

  eq(other: Swatch): boolean {
    return other.color === this.color;
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-color-swatch';
    button.ariaLabel = 'Pick color';
    button.style.backgroundColor = this.color;
    // Keeps the focus in the editor.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => view.dispatch({ effects: TOGGLE.of(view.posAtDOM(button)) }));
    return button;
  }

  // Reuses the button to keep it from flickering while the user drags in the color picker.
  updateDOM(dom: HTMLElement): boolean {
    dom.style.backgroundColor = this.color;
    return true;
  }
}

// Opens the color picker of the hex color at a position, or closes it if it is already open or the position is null.
const TOGGLE = StateEffect.define<number | null>();

// The open color picker.
const PICKER = StateField.define<Tooltip | null>({
  create: () => null,
  update(tooltip, transaction) {
    let pos = tooltip === null ? null : transaction.changes.mapPos(tooltip.pos);
    for (const effect of transaction.effects) {
      if (effect.is(TOGGLE)) {
        pos = effect.value === pos ? null : effect.value;
      }
    }

    if (pos === null || !HEX.test(transaction.state.sliceDoc(pos, pos + 7))) {
      return null;
    }

    return pos === tooltip?.pos ? tooltip : { pos, arrow: false, create: createPicker };
  },
  provide: (field) => showTooltip.from(field),
});

function createPicker(view: EditorView): TooltipView {
  const dom = document.createElement('div');
  dom.className = 'cm-color-picker';

  const area = dom.appendChild(document.createElement('div'));
  area.className = 'cm-color-picker-area';
  area.tabIndex = 0;
  area.role = 'slider';
  area.ariaLabel = 'Saturation and brightness';
  const thumb = area.appendChild(document.createElement('div'));
  thumb.className = 'cm-color-picker-thumb';

  const hue = dom.appendChild(document.createElement('input'));
  hue.type = 'range';
  hue.className = 'cm-color-picker-hue';
  hue.max = '360';
  hue.ariaLabel = 'Hue';

  const hex = dom.appendChild(document.createElement('input'));
  hex.className = 'cm-color-picker-hex';
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.ariaLabel = 'Hex color';

  const read = () => {
    const pos = view.state.field(PICKER)?.pos;
    return pos === undefined ? undefined : view.state.sliceDoc(pos, pos + 7);
  };
  // The picker keeps its own hue, saturation and brightness since a gray's hex color has no hue to read back.
  let [h, s, v] = toHsv(read() ?? '#000000');
  const write = (color = toHex(h, s, v)) => {
    const pos = view.state.field(PICKER)?.pos;
    if (pos !== undefined) {
      view.dispatch({ changes: { from: pos, to: pos + 7, insert: color } });
    }
  };
  const render = () => {
    const color = read();
    if (color !== undefined && color.toLowerCase() !== toHex(h, s, v)) {
      [h, s, v] = toHsv(color);
    }

    area.style.backgroundColor = `hsl(${h} 100% 50%)`;
    area.ariaValueText = `Saturation ${Math.round(s * 100)}%, brightness ${Math.round(v * 100)}%`;
    thumb.style.left = `${s * 100}%`;
    thumb.style.top = `${(1 - v) * 100}%`;
    thumb.style.backgroundColor = toHex(h, s, v);
    hue.value = String(h);
    if (color !== undefined && document.activeElement !== hex) {
      hex.value = color;
    }
  };
  const close = () => view.dispatch({ effects: TOGGLE.of(null) });
  const closeOutside = (event: PointerEvent) => {
    const target = event.target as Element;
    if (!dom.contains(target) && target.closest('.cm-color-swatch') === null) {
      close();
    }
  };
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const drag = (event: PointerEvent) => {
    const box = area.getBoundingClientRect();
    s = clamp((event.clientX - box.left) / box.width);
    v = 1 - clamp((event.clientY - box.top) / box.height);
    write();
  };

  area.addEventListener('pointerdown', (event) => {
    area.setPointerCapture(event.pointerId);
    drag(event);
  });
  area.addEventListener('pointermove', (event) => {
    if (area.hasPointerCapture(event.pointerId)) {
      drag(event);
    }
  });
  area.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const steps: Record<string, [number, number] | undefined> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = steps[event.key];
    if (move !== undefined) {
      event.preventDefault();
      s = clamp(s + move[0]);
      v = clamp(v + move[1]);
      write();
    }
  });
  hue.addEventListener('input', () => {
    h = Number(hue.value);
    write();
  });
  hex.addEventListener('input', () => {
    if (HEX.test(hex.value)) {
      write(hex.value);
    }
  });
  hex.addEventListener('blur', render);
  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
      view.focus();
    }
  });
  document.addEventListener('pointerdown', closeOutside, true);

  render();
  return {
    dom,
    offset: { x: 0, y: 4 },
    update: render,
    destroy: () => document.removeEventListener('pointerdown', closeOutside, true),
  };
}

// Returns the hue in degrees, and the saturation and brightness between 0 and 1, of a six-digit hex color.
function toHsv(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  const hue =
    delta === 0 ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [hue * 60, max === 0 ? 0 : delta / max, max];
}

function toHex(h: number, s: number, v: number): string {
  const channels = [5, 3, 1].map((offset) => {
    const k = (offset + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

const RING = { outline: '2px solid var(--ring)', outlineOffset: '2px' };

// Drawn with the interface's colors and shapes: the swatch like a checkbox, the picker like a menu and its field like
// an input.
const THEME = EditorView.baseTheme({
  '.cm-color-swatch': {
    boxSizing: 'border-box',
    width: '1em',
    height: '1em',
    marginRight: '0.35em',
    padding: '0',
    border: '1px solid var(--input)',
    borderRadius: '3px',
    verticalAlign: '-0.125em',
    cursor: 'pointer',
    outline: 'none',
  },
  '.cm-color-swatch:focus-visible': RING,
  '.cm-tooltip.cm-color-picker': {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '216px',
    padding: '8px',
    border: 'none',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    boxShadow: [
      '0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent)',
      '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      '0 2px 4px -2px rgb(0 0 0 / 0.1)',
    ].join(', '),
  },
  '.cm-color-picker-area': {
    position: 'relative',
    height: '128px',
    borderRadius: 'calc(var(--radius) * 0.8)',
    backgroundImage: 'linear-gradient(transparent, #000), linear-gradient(to right, #fff, transparent)',
    cursor: 'crosshair',
    touchAction: 'none',
    outline: 'none',
  },
  '.cm-color-picker-area:focus-visible': RING,
  '.cm-color-picker-thumb': {
    position: 'absolute',
    boxSizing: 'border-box',
    width: '14px',
    height: '14px',
    margin: '-7px',
    border: '2px solid #fff',
    borderRadius: '50%',
    boxShadow: '0 0 0 1px rgb(0 0 0 / 0.25)',
    pointerEvents: 'none',
  },
  '.cm-color-picker-hue': {
    appearance: 'none',
    height: '8px',
    margin: '3px 0',
    borderRadius: '4px',
    background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
    cursor: 'pointer',
    outline: 'none',
  },
  '.cm-color-picker-hue:focus-visible': RING,
  '.cm-color-picker-hue::-webkit-slider-thumb': {
    appearance: 'none',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    boxShadow: '0 0 0 1px rgb(0 0 0 / 0.25)',
  },
  '.cm-color-picker-hex': {
    boxSizing: 'border-box',
    height: '28px',
    padding: '0 8px',
    border: '1px solid var(--input)',
    borderRadius: 'var(--radius)',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
  },
  '&dark .cm-color-picker-hex': { backgroundColor: 'color-mix(in oklab, var(--input) 30%, transparent)' },
  '.cm-color-picker-hex:focus-visible': { borderColor: 'var(--foreground)' },
});
