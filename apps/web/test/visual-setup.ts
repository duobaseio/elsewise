import { beforeEach } from 'vitest';
import { cdp } from 'vitest/browser';
import './visual.css';

// Moves the pointer off the page, so a test doesn't capture the hover an earlier one left behind.
beforeEach(async () => {
  await cdp().send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1 });
});
