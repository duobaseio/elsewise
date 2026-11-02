import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, type BrowserWindow, type Rectangle } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { closeAfterRenderer, loadWindow, saveWindow } from './window';

interface Display {
  bounds: Rectangle;
  workArea: Rectangle;
}

// Hoisted with the mocks below, which the imports above already use.
const state = vi.hoisted(() => ({
  // The data folder.
  dir: '',
  displays: [] as Display[],
  cursor: { x: 0, y: 0 },
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    app: Object.assign(new EventEmitter(), { quit: vi.fn() }),
    screen: {
      getAllDisplays: () => state.displays,
      getCursorScreenPoint: () => state.cursor,
      getDisplayNearestPoint: ({ x, y }: { x: number; y: number }) =>
        state.displays.find(
          ({ bounds }) => x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height,
        ) ?? state.displays[0],
      // The display that most of the rectangle is on, or the first if it's on none.
      getDisplayMatching: (rectangle: Rectangle) => {
        const overlap = ({ bounds }: Display) =>
          Math.max(
            0,
            Math.min(rectangle.x + rectangle.width, bounds.x + bounds.width) - Math.max(rectangle.x, bounds.x),
          ) *
          Math.max(
            0,
            Math.min(rectangle.y + rectangle.height, bounds.y + bounds.height) - Math.max(rectangle.y, bounds.y),
          );
        const best = state.displays.toSorted((a, b) => overlap(b) - overlap(a))[0];
        return best && overlap(best) > 0 ? best : state.displays[0];
      },
    },
  };
});
vi.mock('@elsewise/core', async (original) => ({
  ...(await original<typeof import('@elsewise/core')>()),
  frontendDataDir: () => state.dir,
}));

// A 1920x1080 display whose top 25 pixels are a menu bar, and its key in `window.json`.
const MAIN: Display = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
};
const MAIN_KEY = '0,0,1920x1080';
// A second display to the right of it.
const SIDE: Display = {
  bounds: { x: 1920, y: 0, width: 1280, height: 1024 },
  workArea: { x: 1920, y: 0, width: 1280, height: 1024 },
};
const BOTH_KEY = '0,0,1920x1080|1920,0,1280x1024';

// The default window, centered in `MAIN`'s work area.
const CENTERED = { x: 448, y: 168, width: 1024, height: 768 };

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elsewise-test-'));
  state.displays = [MAIN];
  state.cursor = { x: 0, y: 0 };
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(state.dir, { recursive: true, force: true });
});

function write(contents: unknown) {
  fs.writeFileSync(
    path.join(state.dir, 'window.json'),
    typeof contents === 'string' ? contents : JSON.stringify(contents),
  );
}

function read(): unknown {
  return JSON.parse(fs.readFileSync(path.join(state.dir, 'window.json'), 'utf8'));
}

describe('loadWindow', () => {
  test('centers a maximized window of the default size when nothing is saved', () => {
    expect(loadWindow()).toEqual({ ...CENTERED, maximized: true });
  });

  test('shrinks the default size to a smaller display', () => {
    const area = { x: 0, y: 0, width: 800, height: 600 };
    state.displays = [{ bounds: area, workArea: area }];

    expect(loadWindow()).toEqual({ ...area, maximized: true });
  });

  test('centers on the display the cursor is on', () => {
    state.displays = [MAIN, SIDE];
    state.cursor = { x: 2000, y: 100 };

    expect(loadWindow()).toEqual({ x: 2048, y: 128, width: 1024, height: 768, maximized: true });
  });

  test('restores a saved window that fits its display', () => {
    const saved = { x: 100, y: 200, width: 800, height: 600, maximized: false };
    write({ [MAIN_KEY]: saved });

    expect(loadWindow()).toEqual(saved);
  });

  test('restores the window saved for the current arrangement of displays', () => {
    const saved = { x: 2000, y: 100, width: 800, height: 600, maximized: false };
    write({ [MAIN_KEY]: { x: 100, y: 200, width: 640, height: 480, maximized: true }, [BOTH_KEY]: saved });
    state.displays = [SIDE, MAIN];

    expect(loadWindow()).toEqual(saved);
  });

  test('ignores a window saved for another arrangement of displays', () => {
    write({ [BOTH_KEY]: { x: 2000, y: 100, width: 800, height: 600, maximized: false } });

    expect(loadWindow()).toEqual({ ...CENTERED, maximized: true });
  });

  test('moves a saved window that is partly off its display back onto it', () => {
    write({ [MAIN_KEY]: { x: 1500, y: -100, width: 800, height: 600, maximized: false } });

    expect(loadWindow()).toEqual({ x: 1120, y: 25, width: 800, height: 600, maximized: false });
  });

  test('shrinks a saved window that is larger than its display', () => {
    write({ [MAIN_KEY]: { x: -50, y: 0, width: 3000, height: 2000, maximized: true } });

    expect(loadWindow()).toEqual({ ...MAIN.workArea, maximized: true });
  });

  test('centers a saved window that is entirely off its display, keeping whether it was maximized', () => {
    write({ [MAIN_KEY]: { x: 5000, y: 5000, width: 800, height: 600, maximized: false } });

    expect(loadWindow()).toEqual({ ...CENTERED, maximized: false });
  });

  test('reports a file that is not JSON, and starts from the default', () => {
    write('{ not json');

    expect(loadWindow()).toEqual({ ...CENTERED, maximized: true });
    expect(error).toHaveBeenCalledOnce();
  });

  test.each([
    ['a file that is not an object', 42],
    ['a window that is not an object', { [MAIN_KEY]: 'window' }],
    ['a null window', { [MAIN_KEY]: null }],
    ['a fractional position', { [MAIN_KEY]: { x: 1.5, y: 0, width: 800, height: 600, maximized: false } }],
    ['a missing position', { [MAIN_KEY]: { y: 0, width: 800, height: 600, maximized: false } }],
    ['a zero width', { [MAIN_KEY]: { x: 0, y: 0, width: 0, height: 600, maximized: false } }],
    ['a negative height', { [MAIN_KEY]: { x: 0, y: 0, width: 800, height: -600, maximized: false } }],
    ['a missing maximized', { [MAIN_KEY]: { x: 0, y: 0, width: 800, height: 600 } }],
  ])('starts from the default for %s', (_name, contents) => {
    write(contents);

    expect(loadWindow()).toEqual({ ...CENTERED, maximized: true });
    expect(error).not.toHaveBeenCalled();
  });
});

describe('saveWindow', () => {
  // A window with the given bounds, whose events the test emits.
  function window(bounds: Rectangle, { maximized = false, minimized = false } = {}) {
    const current = { bounds, maximized, minimized };
    const emitter = new EventEmitter();
    const fake = Object.assign(emitter, {
      getNormalBounds: () => current.bounds,
      isMaximized: () => current.maximized,
      isMinimized: () => current.minimized,
    });
    saveWindow(fake as unknown as BrowserWindow);
    return { emitter, current };
  }

  const BOUNDS = { x: 100, y: 200, width: 800, height: 600 };

  test('saves the latest bounds once the window has stopped changing', () => {
    vi.useFakeTimers();
    const { emitter, current } = window(BOUNDS);

    emitter.emit('resize');
    vi.advanceTimersByTime(200);
    current.bounds = { ...BOUNDS, width: 900 };
    emitter.emit('resize');
    vi.advanceTimersByTime(249);

    expect(fs.existsSync(path.join(state.dir, 'window.json'))).toBe(false);

    vi.advanceTimersByTime(1);

    expect(read()).toEqual({ [MAIN_KEY]: { ...BOUNDS, width: 900, maximized: false } });
  });

  test('saves at once when the window closes', () => {
    vi.useFakeTimers();
    const { emitter } = window(BOUNDS, { maximized: true });

    emitter.emit('close');

    expect(read()).toEqual({ [MAIN_KEY]: { ...BOUNDS, maximized: true } });
  });

  test('keeps the bounds from before the window was minimized', () => {
    vi.useFakeTimers();
    const { emitter, current } = window(BOUNDS);

    emitter.emit('move');
    current.minimized = true;
    current.bounds = { x: -32000, y: -32000, width: 160, height: 28 };
    emitter.emit('close');

    expect(read()).toEqual({ [MAIN_KEY]: { ...BOUNDS, maximized: false } });
  });

  test('saves nothing for a window that was only ever minimized', () => {
    vi.useFakeTimers();
    const { emitter } = window(BOUNDS, { minimized: true });

    emitter.emit('close');

    expect(fs.existsSync(path.join(state.dir, 'window.json'))).toBe(false);
  });

  test('keeps the windows saved for other arrangements of displays', () => {
    vi.useFakeTimers();
    const other = { x: 2000, y: 100, width: 800, height: 600, maximized: false };
    write({ [BOTH_KEY]: other });
    const { emitter } = window(BOUNDS);

    emitter.emit('close');

    expect(read()).toEqual({ [BOTH_KEY]: other, [MAIN_KEY]: { ...BOUNDS, maximized: false } });
  });
});

describe('closeAfterRenderer', () => {
  // A window whose closes, and its renderer's replies, the test emits.
  function window() {
    const fake = Object.assign(new EventEmitter(), {
      close: vi.fn(),
      webContents: { ipc: new EventEmitter(), send: vi.fn() },
    });
    closeAfterRenderer(fake as unknown as BrowserWindow);
    return fake;
  }

  // Emits a close on `window`, and returns whether it went ahead.
  function close(window: EventEmitter): boolean {
    let held = false;
    window.emit('close', { preventDefault: () => (held = true) });
    return !held;
  }

  afterEach(() => {
    app.removeAllListeners();
  });

  test('holds the first close until the renderer replies', () => {
    const fake = window();

    expect(close(fake)).toBe(false);
    expect(fake.webContents.send).toHaveBeenCalledWith('window:close');
    expect(fake.close).not.toHaveBeenCalled();

    fake.webContents.ipc.emit('window:closed');

    expect(fake.close).toHaveBeenCalledOnce();
    expect(close(fake)).toBe(true);
  });

  test('asks the renderer once while the close is held', () => {
    const fake = window();

    close(fake);
    close(fake);

    expect(fake.webContents.send).toHaveBeenCalledOnce();
  });

  test('closes after five seconds without a reply, and warns', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = window();

    close(fake);
    vi.advanceTimersByTime(4999);

    expect(fake.close).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    fake.webContents.ipc.emit('window:closed');

    expect(fake.close).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  test('resumes a quit that the held close cancelled', () => {
    const fake = window();

    app.emit('before-quit');
    close(fake);
    fake.webContents.ipc.emit('window:closed');

    expect(app.quit).toHaveBeenCalledOnce();
    expect(fake.close).not.toHaveBeenCalled();
  });
});
