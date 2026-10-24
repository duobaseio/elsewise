import { Code, TransportError } from '@elsewise/transport';

const CODES: Record<string, Code> = {
  ENOENT: Code.NOT_FOUND,
  EEXIST: Code.ALREADY_EXISTS,
  ENOTEMPTY: Code.ALREADY_EXISTS,
  EACCES: Code.PERMISSION_DENIED,
  EPERM: Code.PERMISSION_DENIED,
  ENOTDIR: Code.FAILED_PRECONDITION,
  EISDIR: Code.FAILED_PRECONDITION,
  EINVAL: Code.INVALID_ARGUMENT,
  ENAMETOOLONG: Code.INVALID_ARGUMENT,
};

/** Returns the system error code a thrown value carries (e.g. `ENOENT`). */
export function errnoOf(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Converts a thrown value into a transport error. */
export function fsToTransportError(error: unknown): TransportError {
  if (error instanceof TransportError) {
    return error;
  }
  const code = CODES[errnoOf(error) ?? ''] ?? Code.UNKNOWN;
  return new TransportError(code, error instanceof Error ? error.message : String(error));
}

/** Attempts a file system operation and throws a `TransportError` if it fails. */
export async function attempt<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw fsToTransportError(error);
  }
}
