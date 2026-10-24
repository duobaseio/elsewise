import type { MessageInitShape } from '@bufbuild/protobuf';
import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import type { IdentitySchema } from '../../gen/elsewise/daemon/git/v1/git_pb';

export type IdentityInit = MessageInitShape<typeof IdentitySchema>;

/** Builds an identity from the given parameters. */
export function identity(name = '', email = '', seconds = '0'): IdentityInit {
  return { name, email, time: timestampFromMs(Number(seconds) * 1000) };
}

/** Drops the newlines git ends a message with. */
export function trimMessage(message: string): string {
  return message.replace(/\n+$/, '');
}
