import { type Client, createClient } from '@elsewise/transport';
import { ProjectService } from '../../src/gen/elsewise/daemon/project/v1/project_service_pb';
import { TerminalService } from '../../src/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import type { TerminalOptions } from '../../src/terminal/service';
import { isolateGit } from '../git/repo';
import { Harness } from '../harness';

/** A harness that starts the terminal service with a client. */
export class TerminalHarness extends Harness<typeof TerminalService> {
  /** Starts a daemon with the options and returns the harness. */
  static async start(options?: Partial<TerminalOptions>): Promise<TerminalHarness> {
    const harness = await TerminalHarness.connect(TerminalService, { terminal: options });
    await isolateGit(harness.nativeRoot);
    return harness;
  }

  /** A client of the project service on the same connection. */
  get projects(): Client<typeof ProjectService> {
    return createClient(this.channel, ProjectService);
  }

  /** Creates a project under the code directory and returns its main workspace. */
  async workspace(name = 'Demo'): Promise<{ id: string; projectId: string; absolutePath: string }> {
    const { project } = await this.projects.createProject({
      source: { case: 'new', value: { name, absolutePath: '' } },
    });
    const { workspaces } = await this.projects.getWorkspaces({ projectId: project?.id ?? '' });
    const workspace = workspaces[0];
    if (!project || !workspace) {
      throw new Error('the project has no main workspace');
    }
    return { id: workspace.id, projectId: project.id, absolutePath: workspace.absolutePath };
  }
}
