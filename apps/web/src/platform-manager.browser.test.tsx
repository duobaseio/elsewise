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
      showPath: async () => {},
      pickPaths: async () => [],
      setBrightness() {},
      setBackground() {},
      onClose() {},
      ...overrides,
    },
  };
}

describe('showPath', () => {
  test('opens path through bridge', async () => {
    const showPath = vi.fn(async () => {});
    bridge({ showPath });

    await new PlatformManager().showPath('/elsewise');

    expect(showPath).toHaveBeenCalledExactlyOnceWith('/elsewise');
  });

  test('throws outside desktop app', async () => {
    await expect(new PlatformManager().showPath('/elsewise')).rejects.toThrow();
  });
});

describe('pickPaths', () => {
  test('returns picked paths', async () => {
    bridge({ pickPaths: async () => ['/elsewise'] });

    expect(await new PlatformManager().pickPaths()).toEqual(['/elsewise']);
  });

  test('forwards options', async () => {
    const pickPaths = vi.fn(async () => []);
    bridge({ pickPaths });

    await new PlatformManager().pickPaths({ kind: 'folder', defaultPath: '/elsewise', createFolder: true });

    expect(pickPaths).toHaveBeenCalledExactlyOnceWith({
      kind: 'folder',
      defaultPath: '/elsewise',
      createFolder: true,
    });
  });

  test('throws outside desktop app', async () => {
    await expect(new PlatformManager().pickPaths()).rejects.toThrow();
  });
});
