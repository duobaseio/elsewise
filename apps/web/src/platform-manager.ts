import type { Platform } from '@elsewise/frontend-plugin';

export class PlatformManager implements Platform {
  async openFolder(absolutePath: string): Promise<void> {
    const openFolder = window.bridge?.window?.openFolder;
    if (openFolder === undefined) {
      throw new Error('No file manager outside the desktop app.');
    }

    await openFolder(absolutePath);
  }

  async pickFolder(): Promise<string | null> {
    const pickFolder = window.bridge?.window?.pickFolder;
    if (pickFolder === undefined) {
      throw new Error('No folder picker outside the desktop app.');
    }

    return pickFolder();
  }
}
