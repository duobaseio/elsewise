import { Code, TransportError } from '@elsewise/transport';
import { fsToTransportError } from '../fs/error';

/** A git process that exited with a code the run did not accept. */
export class GitError extends Error {
  readonly exitCode: number | null;

  constructor(exitCode: number | null, stderr: string, stdout: string) {
    super(clean(stderr) || clean(stdout) || `git exited with ${exitCode ?? 'a signal'}`);
    this.name = 'GitError';
    this.exitCode = exitCode;
  }
}

/** Converts a failure thrown while running git into a transport error. */
export function gitToTransportError(error: unknown): TransportError {
  if (error instanceof TransportError) {
    return error;
  }
  if (error instanceof GitError) {
    return new TransportError(Code.FAILED_PRECONDITION, error.message);
  }
  return fsToTransportError(error); // File system errors could occur as git uses it to a limited extend.
}

/** Attempts a git operation and throws a `TransportError` if it fails. */
export async function attempt<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw gitToTransportError(error);
  }
}

function clean(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('hint:'))
    .map((line) => line.replace(/^(?:fatal|error|warning): /, '').trim())
    .filter((line) => line !== '')
    .join('\n');
}
