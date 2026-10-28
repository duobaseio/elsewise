import path from 'node:path';

/**
 * Where the directory where the application's state lives.
 */
export interface DataDirectory {
  /** The directory itself. */
  root: string;

  /** The SQLite database file. */
  database: string;
}

/**
 * Where the directory where the projects and workspaces are saved.
 */
export interface CodeDirectory {
  /** The directory itself. */
  root: string;

  /**
   * Where the projects' folders are stored (e.g. workspaces/<project>/<worktree>).
   */
  workspaces: string;
}

/** Returns the data directory under the root. */
export function dataDirectory(root: string): DataDirectory {
  return {
    root,
    database: path.join(root, 'elsewise.db'),
  };
}

/** Returns the code directory under the root. */
export function codeDirectory(root: string): CodeDirectory {
  return {
    root,
    workspaces: path.join(root, 'workspaces'),
  };
}
