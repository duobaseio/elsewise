import { cdp } from 'vitest/browser';

export const THEMES = ['light', 'dark'] as const;

/**
 * The set DevTools exposes as "Force element state" checkboxes — the same
 * `CSS.forcePseudoState` call backs both.
 */
export type ForcedPseudoClass = 'active' | 'focus' | 'focus-visible' | 'focus-within' | 'hover' | 'target' | 'visited';

export type PseudoForce = {
  selector: string;
  pseudoClasses: readonly ForcedPseudoClass[];
};

/**
 * Force pseudo-classes on elements, so a whole grid of buttons can sit in
 * `:hover` at once — a real pointer can only ever be over one of them.
 *
 * Every force is applied against a single `DOM.getDocument`: that call resets
 * the agent's node-id map, so interleaving fetches with applications would risk
 * writing state against ids the next fetch invalidates. The CDP session is
 * likewise acquired once, since a provider is free to return a fresh one per
 * `cdp()` call and node ids do not carry across sessions.
 *
 * Pass an empty `pseudoClasses` array to clear.
 *
 * Throws when a selector matches nothing. A silent no-op is the worst available
 * failure here: the sheet would render at rest, be blessed as the hover
 * baseline, and the suite would verify a fiction from then on.
 */
export async function forcePseudoStates(forces: readonly PseudoForce[]): Promise<void> {
  const session = cdp();
  await session.send('DOM.enable');
  await session.send('CSS.enable');

  // Vitest attaches the session to the top-level page, but tests render inside its tester iframe — and
  // `DOM.querySelectorAll` does not cross that boundary. Nor does it cross a shadow boundary, which the file tree
  // renders its every row behind. `pierce` walks through both, so collect each one as a root to search in turn.
  const { root } = await session.send('DOM.getDocument', {
    depth: -1,
    pierce: true,
  });
  const roots = [root.nodeId];
  const visit = (node: typeof root) => {
    if (node.contentDocument) {
      roots.push(node.contentDocument.nodeId);
      visit(node.contentDocument);
    }
    node.shadowRoots?.forEach((shadowRoot) => {
      roots.push(shadowRoot.nodeId);
      visit(shadowRoot);
    });
    node.children?.forEach(visit);
  };
  visit(root);

  for (const { selector, pseudoClasses } of forces) {
    let matched = 0;
    for (const nodeId of roots) {
      const { nodeIds } = await session.send('DOM.querySelectorAll', {
        nodeId,
        selector,
      });
      for (const target of nodeIds) {
        await session.send('CSS.forcePseudoState', {
          nodeId: target,
          forcedPseudoClasses: [...pseudoClasses],
        });
        matched += 1;
      }
    }
    if (matched === 0) {
      throw new Error(`forcePseudoStates: no element matched \`${selector}\``);
    }
  }
}
