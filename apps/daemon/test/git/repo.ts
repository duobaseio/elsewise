import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { toProtocolPath } from '../../src/fs/path';
import { Git } from '../../src/git/git';

/** Prevents the machine's git configuration from being overridden. */
export async function isolateGit(nativeDirectory: string): Promise<void> {
  process.env.GIT_CONFIG_GLOBAL = path.join(nativeDirectory, 'gitconfig');
  process.env.GIT_CONFIG_SYSTEM = path.join(nativeDirectory, 'gitconfig-system');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  await fs.writeFile(process.env.GIT_CONFIG_GLOBAL, '[init]\n\tdefaultBranch = main\n');
}

/** A repository a test drives directly. */
export class Repo {
  /** The repository's root as a native path. */
  readonly nativeRoot: string;

  /** The repository's root as a protocol path. */
  readonly protocolRoot: string;

  /** The `Git` instance that runs git in the repository. */
  readonly git: Git;

  constructor(nativeRoot: string) {
    this.nativeRoot = nativeRoot;
    this.protocolRoot = toProtocolPath(nativeRoot);
    this.git = new Git(nativeRoot, Number.POSITIVE_INFINITY);
  }

  /** Creates and initializes the repository with an identity. */
  async init(): Promise<void> {
    await fs.mkdir(this.nativeRoot);
    await this.run('init', '--quiet');
    await this.run('config', 'user.name', 'Test');
    await this.run('config', 'user.email', 'test@example.com');
  }

  /** Runs git in the repository and returns the trimmed stdout. */
  async run(...args: string[]): Promise<string> {
    return (await this.git.text(args)).trim();
  }

  /** Writes a file in the repository. */
  async write(relativeProtocolPath: string, content: string): Promise<void> {
    const nativePath = path.join(this.nativeRoot, relativeProtocolPath);
    await fs.mkdir(path.dirname(nativePath), { recursive: true });
    await fs.writeFile(nativePath, content);
  }

  /** Reads a file in the repository. */
  read(relativeProtocolPath: string): Promise<string> {
    return fs.readFile(path.join(this.nativeRoot, relativeProtocolPath), 'utf8');
  }

  /** Writes a file, stages it and commits it. Returns the commit's hash. */
  async commit(
    relativeProtocolPath: string,
    content: string,
    message = `write ${relativeProtocolPath}`,
  ): Promise<string> {
    await this.write(relativeProtocolPath, content);
    await this.run('add', '--', relativeProtocolPath);
    await this.run('commit', '--quiet', '--message', message);
    return this.run('rev-parse', 'HEAD');
  }
}

/** A repository in a temporary directory of its own, with the machine's git configuration kept out. */
export class TestRepo extends Repo {
  private readonly nativeDirectory: string;

  private constructor(nativeDirectory: string) {
    super(path.join(nativeDirectory, 'repo'));
    this.nativeDirectory = nativeDirectory;
  }

  /** Creates a repository in a fresh temporary directory with identity. */
  static async create(): Promise<TestRepo> {
    const nativeDirectory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-git-')));
    await isolateGit(nativeDirectory);
    const repo = new TestRepo(nativeDirectory);
    await repo.init();
    return repo;
  }

  /** Deletes the repository. */
  remove(): Promise<void> {
    return fs.rm(this.nativeDirectory, { recursive: true, force: true });
  }
}
