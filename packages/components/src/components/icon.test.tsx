import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Icon, IconProvider } from './icon';

function Custom(props: ComponentProps<'svg'>) {
  return <svg data-custom="" {...props} />;
}

test('draws the default without a provider', () => {
  const markup = renderToStaticMarkup(<Icon name="check" className="size-4" />);

  expect(markup).toMatch(/^<svg/);
  expect(markup).toContain('class="size-4"');
  expect(markup).not.toContain('data-custom');
});

test('draws the provider’s icon and passes props through', () => {
  const markup = renderToStaticMarkup(
    <IconProvider icons={{ check: Custom }}>
      <Icon name="check" className="size-4" />
    </IconProvider>,
  );

  expect(markup).toBe('<svg data-custom="" class="size-4"></svg>');
});

test('falls back to the default for a role the provider leaves out', () => {
  const markup = renderToStaticMarkup(
    <IconProvider icons={{ check: Custom }}>
      <Icon name="close" />
    </IconProvider>,
  );

  expect(markup).not.toContain('data-custom');
});
