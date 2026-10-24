import { Code, TransportError } from '@elsewise/transport';
import { parseProtocolPath } from '../fs/path';

/** Returns the value as a git argument and guards against invalid/malicious operands. */
export function guardOperand(value: string, operation: string): string {
  if (value === '' || value.startsWith('-') || value.includes('\0')) {
    throw new TransportError(Code.INVALID_ARGUMENT, `"${value}" is not a valid ${operation}`);
  }
  return value;
}

/** Returns the revision or `HEAD`. */
export function revisionOrHead(revision: string): string {
  return revision === '' ? 'HEAD' : guardOperand(revision, 'revision');
}

/** Returns the revisions as git arguments. Requires at least a single revision. */
export function revisions(values: string[]): string[] {
  if (values.length === 0) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'at least one revision is needed');
  }
  return values.map((value) => guardOperand(value, 'revision'));
}

/** Returns the `--mainline` argument for a merge commit's parent or nothing for `0`. */
export function mainline(parent: number): string[] {
  return parent === 0 ? [] : [`--mainline=${parent}`];
}

/** Converts relative protocol paths into literal pathspecs. */
export function pathspecs(relativePaths: string[]): string[] {
  const pathSpecs: string[] = [];
  for (const relativePath of relativePaths) {
    const segments = parseProtocolPath(relativePath);
    if (segments.length === 0) {
      return [];
    }
    pathSpecs.push(`:(literal)${segments.join('/')}`);
  }
  return pathSpecs;
}

/** Validates a relative protocol file path and converts it to a valid git path. */
export function filePath(relativeProtocolPath: string): string {
  const segments = parseProtocolPath(relativeProtocolPath);
  if (segments.length === 0) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'the path must not be empty');
  }
  return relativeProtocolPath;
}

/** Appends the pathspecs if defined. An empty pathspecs represents the entire directory with `.`. */
export function withPathspecs(args: string[], pathspecs: string[] | undefined = undefined): string[] {
  if (pathspecs === undefined) {
    return args;
  }
  return [...args, '--', ...(pathspecs.length > 0 ? pathspecs : ['.'])];
}
