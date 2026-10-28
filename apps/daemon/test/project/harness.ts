import path from 'node:path';
import { ProjectService } from '../../src/gen/elsewise/daemon/project/v1/project_service_pb';
import type { ProjectOptions } from '../../src/project/service';
import { isolateGit, Repo } from '../git/repo';
import { Harness } from '../harness';

/** A harness that starts the project service with a client. */
export class ProjectHarness extends Harness<typeof ProjectService> {
  /** Starts a daemon with the options and returns the harness. */
  static async start(options?: Partial<ProjectOptions>): Promise<ProjectHarness> {
    const harness = await ProjectHarness.connect(ProjectService, { project: options });
    await isolateGit(harness.nativeRoot);
    return harness;
  }

  /** Creates and initializes a repository with one commit under the root. */
  async repo(name: string): Promise<Repo> {
    const repo = new Repo(path.join(this.nativeRoot, name));
    await repo.init();
    await repo.commit('README.md', `# ${name}\n`);
    return repo;
  }

  /** Opens a repository that exists anywhere. */
  open(nativeRoot: string): Repo {
    return new Repo(nativeRoot);
  }
}
