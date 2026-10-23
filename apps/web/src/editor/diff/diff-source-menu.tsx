import type { EditorView } from '@codemirror/view';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@elsewise/components/components/dropdown-menu';
import { type ReactElement, type RefObject, useState } from 'react';
import { EDITOR_DIFF } from '@/editor/diff/diff';
import { useEditorManager } from '@/editor/editor-manager';

export interface DiffSourceMenuProps {
  readonly view: RefObject<EditorView | null>;
  /**
   * The edge of `trigger` that the menu lines up with. Defaults to its start.
   */
  readonly align?: 'start' | 'center' | 'end';
  /**
   * The element that opens the menu, e.g. a button.
   */
  readonly trigger: ReactElement;
}

/**
 * A menu of the sources that the file can be compared with, which checks the one it is compared with.
 */
export function DiffSourceMenu({ view, align, trigger }: DiffSourceMenuProps) {
  const diffs = useEditorManager((editor) => editor.diffs);
  const sources = useEditorManager((editor) => editor.diffs.sources);
  // Controlled, so that the menu renders the editor's state as of opening.
  const [open, setOpen] = useState(false);
  const editor = view.current;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(open) => {
        if (!open) {
          editor?.focus();
        }
      }}
    >
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align}>
        {editor !== null && (
          <DropdownMenuRadioGroup
            value={editor.state.facet(EDITOR_DIFF)?.source ?? null}
            onValueChange={(id: string) => diffs.set(editor, id)}
          >
            {sources
              .filter((source) => source.shown?.(editor) !== false)
              .map((source) => (
                <DropdownMenuRadioItem key={source.id} value={source.id} closeOnClick>
                  {source.label}
                </DropdownMenuRadioItem>
              ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
