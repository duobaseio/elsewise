import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { ComponentProps, ComponentType } from 'react';

/**
 * The orders of the built-in toolbar items, from right to left.
 *
 * See {@link EditorToolbarItem}.
 */
export const DEFAULT_EDITOR_TOOLBAR = {
  diagnostics: 10,
  diff: 20,
} as const;

/**
 * An item in the editor's floating toolbar, in the top right corner.
 *
 * Items are positioned by `order` from right to left, and by id when equal. Items without an order are leftmost.
 *
 * See {@link DEFAULT_EDITOR_TOOLBAR}.
 */
export type EditorToolbarItem = EditorToolbarCommandItem | EditorToolbarComponentItem;

/**
 * A toolbar button that runs a command.
 *
 * The button is hidden when the command is not shown, and disabled when it is not enabled. Its tooltip is the
 * command's label and key.
 */
export interface EditorToolbarCommandItem {
  readonly type: 'command';

  /**
   * The order of this item in the toolbar, shown from right to left and by id when equal. Items without one are
   * leftmost.
   *
   * See {@link DEFAULT_EDITOR_TOOLBAR} for the built-in items' orders.
   */
  readonly order?: number;

  /**
   * The icon it shows, an SVG drawn in the button's color and size, e.g. a Phosphor icon.
   */
  readonly icon: ComponentType<ComponentProps<'svg'>>;

  /**
   * The id of the command it runs, which is also the item's id. Omitted if the id is invalid, missing or already
   * exists.
   *
   * See {@link DEFAULT_COMMANDS} for the built-in commands.
   */
  readonly command: string;
}

/**
 * A toolbar item that renders a React component.
 *
 * The component is rendered inside Elsewise's React tree, at the toolbar's height of 24px. It is hidden if it throws.
 */
export interface EditorToolbarComponentItem {
  readonly type: 'component';

  /**
   * The order of this item in the toolbar, shown from right to left and by id when equal. Items without one are
   * leftmost.
   *
   * See {@link DEFAULT_EDITOR_TOOLBAR} for the built-in items' orders.
   */
  readonly order?: number;

  /**
   * The item's id, namespaced by the plugin's, e.g. `io.example.words`. Omitted if the id already exists.
   */
  readonly id: string;

  /**
   * The component it renders.
   */
  readonly component: ComponentType<EditorToolbarProps>;
}

/**
 * The props of a toolbar component.
 */
export interface EditorToolbarProps {
  /**
   * The editor the toolbar is in.
   */
  readonly view: EditorView;

  /**
   * Registers a `listener` that is called on each of the editor's updates.
   *
   * Returns a function that unregisters the `listener`, which can be returned from an effect:
   * ```tsx
   * useEffect(() => subscribe((update) => setLength(update.state.doc.length)), [subscribe]);
   * ```
   */
  readonly subscribe: (listener: (update: ViewUpdate) => void) => () => void;
}
