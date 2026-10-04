import { afterEach, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { Header } from '@/components/header';

afterEach(() => {
  window.bridge = undefined;
});

function desktop() {
  window.bridge = { window: { getBackground: async () => '', setBackground() {} } };
}

async function header(props: Parameters<typeof Header>[0] = {}) {
  const screen = await render(<Header {...props} />);
  return getComputedStyle(screen.getByRole('banner').element());
}

test('outside the desktop it is an inert strip', async () => {
  const style = await header({ trafficLights: true });
  expect(style.height).toBe('36px');
  expect(style.paddingLeft).toBe('0px');
  expect(style.getPropertyValue('-webkit-app-region')).not.toBe('drag');
});

test('inside the desktop it drags the window', async () => {
  desktop();
  const style = await header();
  expect(style.getPropertyValue('-webkit-app-region')).toBe('drag');
  expect(style.paddingLeft).toBe('0px');
});

test('inside the desktop the traffic-light header clears the buttons, whatever padding the caller sets', async () => {
  desktop();
  const style = await header({ trafficLights: true, className: 'px-2' });
  expect(style.paddingLeft).toBe('80px');
  expect(style.paddingRight).toBe('8px');
});

test('renders its children', async () => {
  const screen = await render(<Header>Back</Header>);
  await expect.element(screen.getByRole('banner')).toHaveTextContent('Back');
});

test('draws no lines of its own', async () => {
  expect((await header()).borderBottomWidth).toBe('0px');
});

test('the caller adds the lines', async () => {
  expect((await header({ className: 'border-border border-b' })).borderBottomWidth).toBe('1px');
});
