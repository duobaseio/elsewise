import type { ThemeId } from '@elsewise/bridge';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ThemeSelect } from './-theme';

const DRACULA: ThemeId = { source: 'elsewise', name: 'dracula' };

// Renders a select showing `theme`. Returns its onChange.
async function mount(theme: ThemeId | null) {
  const onChange = vi.fn();
  await render(<ThemeSelect label="Theme" onChange={onChange} theme={theme} />);
  return onChange;
}

function shown() {
  return document.querySelector('[aria-label="Theme"] [data-slot="select-value"]')?.textContent;
}

describe('ThemeSelect', () => {
  test('shows interface theme for null', async () => {
    await mount(null);

    await expect.poll(shown).toBe('Same as interface');
  });

  test('shows theme', async () => {
    await mount(DRACULA);

    await expect.poll(shown).toBe('Dracula');
  });

  test('returns picked theme', async () => {
    const onChange = await mount(null);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Dracula' }));

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith(DRACULA);
  });

  test('returns null for interface theme', async () => {
    const onChange = await mount(DRACULA);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Same as interface' }));

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
