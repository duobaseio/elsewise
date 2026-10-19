import type { FileSystemOptions } from '../../src/fs/service';
import { FileSystemService } from '../../src/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { Harness } from '../harness';

/** A harness that starts the fs service with a client. */
export class FileSystemHarness extends Harness<typeof FileSystemService> {
  /** Starts a daemon with the options and returns the harness. */
  static start(options?: Partial<FileSystemOptions>): Promise<FileSystemHarness> {
    return FileSystemHarness.connect(FileSystemService, { fileSystem: options });
  }
}
