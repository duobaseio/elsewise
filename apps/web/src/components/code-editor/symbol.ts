import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { getStyleTags, type Tag } from '@lezer/highlight';

/**
 * Returns the word at the cursor and whether it's highlighted as `tag` or one of its kinds, or `null` off a word.
 */
export function symbol(state: EditorState): { from: number; to: number; is: (tag: Tag) => boolean } | null {
  const word = state.wordAt(state.selection.main.head);
  if (!word) {
    return null;
  }

  // The first highlighted node around the word.
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(word.from, 1);
  while (node && !getStyleTags(node)) {
    node = node.parent;
  }
  const styles = node ? (getStyleTags(node)?.tags ?? []) : [];
  return { from: word.from, to: word.to, is: (tag) => styles.some((style) => style.set.includes(tag)) };
}
