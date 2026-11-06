import type { WindowBridge } from '@elsewise/bridge';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PlatformManager } from '@/platform-manager';

afterEach(() => {
  window.bridge = undefined;
});

function bridge(overrides: Partial<WindowBridge>) {
  window.bridge = {
    window: {
      cut() {},
      copy() {},
      paste() {},
      openFolder: async () => {},
      pickFolder: async () => null,
      pickFile: async () => null,
      setBrightness() {},
      setBackground() {},
      onClose() {},
      ...overrides,
    },
  };
}

describe('openFolder', () => {
  test('opens path through bridge', async () => {
    const openFolder = vi.fn(async () => {});
    bridge({ openFolder });

    await new PlatformManager().openFolder('/elsewise');

    expect(openFolder).toHaveBeenCalledExactlyOnceWith('/elsewise');
  });

  test('throws outside desktop app', async () => {
    await expect(new PlatformManager().openFolder('/elsewise')).rejects.toThrow();
  });
});

describe('pickFolder', () => {
  test('returns picked path', async () => {
    bridge({ pickFolder: async () => '/elsewise' });

    expect(await new PlatformManager().pickFolder()).toBe('/elsewise');
  });

  test('returns null on cancel', async () => {
    bridge({});

    expect(await new PlatformManager().pickFolder()).toBeNull();
  });

  test('throws outside desktop app', async () => {
    await expect(new PlatformManager().pickFolder()).rejects.toThrow();
  });
});
