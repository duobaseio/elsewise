import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ScrollbackInput } from '@/routes/settings/local/appearance/terminal/-scrollback-input';

describe('ScrollbackInput', () => {
  test('changes within limits', async () => {
    const onChange = vi.fn();
    await render(<ScrollbackInput label="Scrollback" onChange={onChange} value={10000} />);
    const input = page.getByRole('textbox', { name: 'Scrollback' });

    await userEvent.fill(input, '500');
    await expect.element(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.fill(input, '200000');
    await expect.element(input).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.fill(input, '20000');

    expect(onChange).toHaveBeenCalledExactlyOnceWith(20000);
  });
});
