import path from 'node:path';
import { Code, TransportError } from '@elsewise/transport';

/** Converts a `/`-separated absolute root into its native form. */
export function toNativeRoot(protocolRoot: string): string {
  // \0 checks for the NUL characters.
  if (protocolRoot.includes('\0') || !path.isAbsolute(protocolRoot)) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'the root must be an absolute path');
  }
  return path.resolve(protocolRoot);
}

/** Splits a `/`-separated path into its segments. */
export function parseProtocolPath(relativeProtocolPath: string): string[] {
  if (relativeProtocolPath === '') {
    return [];
  }
  const segments = relativeProtocolPath.split('/');
  for (const segment of segments) {
    // Checked only on Windows as `\` and `:` represents special characters on the file system. It is legal to have
    // those characters on Unix based devices.
    const windowsReserved = path.sep === '\\' && /[\\:]/.test(segment);
    if (segment === '' || segment === '.' || segment === '..' || segment.includes('\0') || windowsReserved) {
      throw new TransportError(Code.INVALID_ARGUMENT, `"${relativeProtocolPath}" is not a valid path`);
    }
  }
  return segments;
}

/** Converts a protocol's root and path into a native absolute path. */
export function toNativePathOrRoot(protocolRoot: string, relativeProtocolPath: string): string {
  return path.join(toNativeRoot(protocolRoot), ...parseProtocolPath(relativeProtocolPath));
}

/** Converts a protocol's root and path into the native absolute path. The `relativeProtocolPath` must be non-empty. */
export function toNativePath(protocolRoot: string, relativeProtocolPath: string): string {
  if (relativeProtocolPath === '') {
    throw new TransportError(Code.INVALID_ARGUMENT, 'the path must not be empty');
  }
  return toNativePathOrRoot(protocolRoot, relativeProtocolPath);
}

/** Converts a native path into its `/`-separated form. */
export function toProtocolPath(nativePath: string): string {
  return path.sep === '/' ? nativePath : nativePath.replaceAll(path.sep, '/');
}
