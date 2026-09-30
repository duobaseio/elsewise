import { vi } from 'vitest';

/** Waits for a rendered file tree's rows and its sprite's icon assets, so a screenshot has no blank icon lanes. */
export async function settleTree(expectedRows: number): Promise<void> {
  const shadowRoot = await vi.waitFor(() => {
    const host = document.querySelector('file-tree-container');
    if (host?.shadowRoot == null) throw new Error('settleTree: no file tree shadow root');
    return host.shadowRoot;
  });

  await vi.waitFor(() => {
    const rows = shadowRoot.querySelectorAll('[data-type="item"]').length;
    if (rows !== expectedRows) {
      throw new Error(`settleTree: ${rows} rows rendered, expected ${expectedRows}`);
    }
  });

  const sprite = shadowRoot.querySelectorAll('image');
  const urls = [...sprite].map((image) => image.getAttribute('href')).filter((href) => href != null);
  await Promise.all(urls.map((url) => fetch(url)));

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
