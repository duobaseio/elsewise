import fs from 'node:fs';
import path from 'node:path';
import { dataLocalDir, writeJsonSync } from '@elsewise/core';
import { app, type BrowserWindow, type Rectangle, screen } from 'electron';

interface Window extends Rectangle {
  maximized: boolean;
}

const DEFAULT_SIZE = { width: 1024, height: 768 };
const SAVE_DELAY_MS = 250;
const CLOSE_TIMEOUT_MS = 5000;

export function saveWindow(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined;
  let latest: Window | undefined;

  function sample(): void {
    // A minimized window reports nonsense bounds on Windows.
    if (!window.isMinimized()) {
      latest = { ...window.getNormalBounds(), maximized: window.isMaximized() };
    }
  }

  function flush(): void {
    clearTimeout(timer);
    timer = undefined;
    if (!latest) {
      return;
    }

    writeJsonSync(path.join(dataLocalDir(), 'window.json'), { ...loadLayouts(), [layoutKey()]: latest });
  }

  function schedule(): void {
    sample();
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', () => {
    sample();
    flush();
  });
}

export function loadWindow(): Window {
  const saved = loadLayouts()[layoutKey()];
  if (!saved) {
    return centered(true);
  }

  const area = screen.getDisplayMatching(saved).workArea;
  const overlaps =
    saved.x < area.x + area.width &&
    saved.x + saved.width > area.x &&
    saved.y < area.y + area.height &&
    saved.y + saved.height > area.y;

  if (!overlaps) {
    return centered(saved.maximized);
  }

  const width = Math.min(saved.width, area.width);
  const height = Math.min(saved.height, area.height);
  return {
    x: Math.max(area.x, Math.min(saved.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(saved.y, area.y + area.height - height)),
    width,
    height,
    maximized: saved.maximized,
  };
}

function centered(maximized: boolean): Window {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(DEFAULT_SIZE.width, area.width);
  const height = Math.min(DEFAULT_SIZE.height, area.height);
  return {
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
    width,
    height,
    maximized,
  };
}

function layoutKey(): string {
  return screen
    .getAllDisplays()
    .map(({ bounds }) => `${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`)
    .sort()
    .join('|');
}

function loadLayouts(): Record<string, Window> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(dataLocalDir(), 'window.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('window: unreadable, starting from defaults', error);
    }
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }

  const layouts: Record<string, Window> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const { x, y, width, height, maximized } = value as Record<string, unknown>;
    if (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(width) &&
      (width as number) > 0 &&
      Number.isInteger(height) &&
      (height as number) > 0 &&
      typeof maximized === 'boolean'
    ) {
      layouts[key] = { x, y, width, height, maximized } as Window;
    }
  }

  return layouts;
}

/**
 * Holds `window`'s first close until its renderer replies to `window:close`, or for five seconds, so the renderer can
 * finish first, e.g. disabling its plugins.
 *
 * Holding a close cancels a quit, so a quit that started it is resumed afterwards.
 */
export function closeAfterRenderer(window: BrowserWindow): void {
  let quitting = false;
  let held = false;
  let done = false;

  const quit = () => {
    quitting = true;
  };
  app.on('before-quit', quit);
  window.on('closed', () => app.off('before-quit', quit));

  window.on('close', (event) => {
    if (done) {
      return;
    }

    event.preventDefault();
    if (held) {
      return;
    }

    held = true;
    const finish = () => {
      if (done) {
        return;
      }

      done = true;
      clearTimeout(timer);
      if (quitting) {
        app.quit();
      } else {
        window.close();
      }
    };
    const timer = setTimeout(() => {
      console.warn(`window: renderer did not finish within ${CLOSE_TIMEOUT_MS}ms, closing anyway`);
      finish();
    }, CLOSE_TIMEOUT_MS);
    window.webContents.ipc.once('window:closed', finish);
    window.webContents.send('window:close');
  });
}
