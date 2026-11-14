import type { PickPathsOptions, Platform } from '@elsewise/frontend-plugin';

export class PlatformManager implements Platform {
  async showPath(absolutePath: string): Promise<void> {
    const showPath = window.bridge?.window?.showPath;
    if (showPath === undefined) {
      throw new Error('No file manager outside the desktop app.');
    }

    await showPath(absolutePath);
  }

  async pickPaths(options?: PickPathsOptions): Promise<string[]> {
    const pickPaths = window.bridge?.window?.pickPaths;
    if (pickPaths === undefined) {
      throw new Error('No picker outside the desktop app.');
    }

    return pickPaths(options);
  }
}
