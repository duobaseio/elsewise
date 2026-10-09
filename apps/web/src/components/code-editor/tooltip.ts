import { shortcut } from '@elsewise/components/lib/os';

/**
 * Returns a line of keys and what they do, e.g. `↩ insert · ⇥ replace`, with the keys muted.
 */
export function hint(className: string, actions: [binding: string, label: string][]): HTMLElement {
  const dom = document.createElement('div');
  dom.className = className;
  for (const [i, [binding, label]] of actions.entries()) {
    const key = document.createElement('kbd');
    key.textContent = shortcut(binding);
    dom.append(i === 0 ? '' : ' · ', key, ` ${label}`);
  }
  return dom;
}

/**
 * Appends text to an element, with the parts quoted in backticks as code.
 */
export function appendCode(parent: HTMLElement, text: string) {
  for (const [i, part] of text.split(/`([^`]+)`/).entries()) {
    if (i % 2 === 0) {
      parent.append(part);
    } else {
      parent.appendChild(document.createElement('code')).textContent = part;
    }
  }
}
