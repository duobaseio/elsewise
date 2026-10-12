import { afterEach, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { Header } from '@/components/header';

afterEach(() => {
  window.bridge = undefined;
});

function desktop() {
  window.bridge = {
    window: {
      setBrightness() {},
      setBackground() {},
    },
  };
}

async function header(props: Parameters<typeof Header>[0] = {}) {
  const screen = await render(<Header {...props} />);
  return getComputedStyle(screen.getByRole('banner').element());
}

test('is inert strip outside desktop', async () => {
  const style = await header({ trafficLights: true });
  expect(style.height).toBe('36px');
  expect(style.paddingLeft).toBe('0px');
  expect(style.getPropertyValue('-webkit-app-region')).not.toBe('drag');
});

test('drags window inside desktop', async () => {
  desktop();
  const style = await header();
  expect(style.getPropertyValue('-webkit-app-region')).toBe('drag');
});

test('traffic-light header clears buttons inside desktop regardless of padding', async () => {
  desktop();
  const style = await header({ trafficLights: true, className: 'px-2' });
  expect(style.paddingLeft).toBe('80px');
  expect(style.paddingRight).toBe('8px');
});
