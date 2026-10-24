import path from 'node:path';
import { GitService } from '../../src/gen/elsewise/daemon/git/v1/git_service_pb';
import { Git } from '../../src/git/git';
import type { GitOptions } from '../../src/git/service';
import { Harness } from '../harness';
import { isolateGit, Repo } from './repo';

/** A harness that starts the git service with a client. */
export class GitHarness extends Harness<typeof GitService> {
  /** Starts a daemon with the options and returns the harness. */
  static async start(options?: Partial<GitOptions>): Promise<GitHarness> {
    const harness = await GitHarness.connect(GitService, { git: options });
    await isolateGit(harness.nativeRoot);
    return harness;
  }

  /** Creates and initializes a repository under the root. */
  async repo(name: string): Promise<Repo> {
    const repo = new Repo(path.join(this.nativeRoot, name));
    await repo.init();
    return repo;
  }

  /**
   * Creates a bare repository under the root. Returns its native path.
   *
   * Used to mimic a remote origin.
   */
  async bare(name: string): Promise<string> {
    const nativePath = path.join(this.nativeRoot, name);
    await new Git(this.nativeRoot, Number.POSITIVE_INFINITY).run(['init', '--quiet', '--bare', nativePath]);
    return nativePath;
  }

  /** Opens a repository that exists under the root. */
  open(name: string): Repo {
    return new Repo(path.join(this.nativeRoot, name));
  }
}
