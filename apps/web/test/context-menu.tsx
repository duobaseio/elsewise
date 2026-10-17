import { history } from '@codemirror/commands';
import { foldGutter, LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ContextMenu, ContextMenuGroup, ContextMenuItem, ContextMenuSubmenuItem } from '@elsewise/plugin';
import { useEffect, useRef } from 'react';
import { expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CommandManagerContext } from '@/command/command-manager';
import { EditorContextMenu, rightClickContextMenu } from '@/editor/context-menu';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { builtInCommands } from './commands';

/** The Rust document that `mount` opens. */
export const DOC = 'fn main() {\n    let a = 1;\n}\n';

/** Returns a view of `DOC` in Rust with the context menu of `editor` and `commands`, and `extensions`. */
export async function mount(
  editor = new EditorManager(),
  commands = builtInCommands(editor),
  extensions: Extension = [],
): Promise<EditorView> {
  const rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  function Probe() {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView>(null);
    useEffect(() => {
      view.current = new EditorView({
        state: EditorState.create({
          doc: DOC,
          extensions: [history(), foldGutter(), rightClickContextMenu, rust, extensions],
        }),
        parent: host.current as HTMLDivElement,
      });
      resolve(view.current);
      return () => view.current?.destroy();
    }, []);
    return (
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <EditorContextMenu view={view}>
            <div ref={host} />
          </EditorContextMenu>
        </CommandManagerContext>
      </EditorManagerContext>
    );
  }
  render(<Probe />);
  return ready;
}

/** Opens the context menu of `view` by right-clicking at `pos`. */
export async function open(view: EditorView, pos: number): Promise<void> {
  const rect = view.coordsAtPos(pos);
  if (rect === null) {
    throw new Error('offscreen');
  }
  const content = view.contentDOM.getBoundingClientRect();
  await userEvent.click(view.contentDOM, {
    button: 'right',
    position: { x: rect.left - content.left + 1, y: rect.top - content.top + 1 },
  });
  await expect.element(page.getByRole('menu').first()).toBeVisible();
}

/** Returns the menu item named `name`. The accessible name carries the shortcut too. */
export const menuitem = (name: string) => page.getByRole('menuitem', { name: new RegExp(`^${name}`) });

/**
 * Returns the labels of the items in `root`, and `-` for each separator. An item's label is its first node, ahead of
 * its shortcut.
 */
export function labels(root: ParentNode = document): (string | null | undefined)[] {
  return [...root.querySelectorAll('[data-slot="context-menu-item"], [data-slot="context-menu-separator"]')].map(
    (element) =>
      element.getAttribute('data-slot') === 'context-menu-separator' ? '-' : element.firstChild?.textContent,
  );
}

/** Returns a menu with `submenus`, `groups` and `items`. */
export function menu({ submenus = {}, groups = {}, items = {} }: Partial<ContextMenu>): ContextMenu {
  return { submenus, groups, items };
}

/** Returns a group at `order`, or without one, in the submenu with id `menu`, or in the menu itself. */
export function group(order?: number, menu?: string): ContextMenuGroup {
  return { ...(menu === undefined ? {} : { menu }), ...(order === undefined ? {} : { order }) };
}

/** Returns an item that runs the command with `id` at `order`, or without one. */
export function item(id: string, order?: number): ContextMenuItem {
  return { type: 'item', ...(order === undefined ? {} : { order }), command: id };
}

/** Returns an item that opens the submenu with `id` at `order`, or without one. */
export function submenu(id: string, order?: number): ContextMenuSubmenuItem {
  return { type: 'submenu', ...(order === undefined ? {} : { order }), submenu: id };
}
