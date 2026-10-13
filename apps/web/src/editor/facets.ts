import { Facet } from '@codemirror/state';
import type { Commands } from '@elsewise/plugin';

/**
 * The commands, for extensions to read their keys and run them.
 */
export const COMMANDS = Facet.define<Commands, Commands | null>({ combine: (values) => values[0] ?? null });
