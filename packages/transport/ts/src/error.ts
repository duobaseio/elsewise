import { Code } from './gen/elsewise/transport/v1/envelope_pb';

/**
 * A call that finished with any outcome but CODE_OK.
 */
export class TransportError extends Error {
  readonly code: Code;

  constructor(code: Code, message: string) {
    super(message || Code[code]);
    this.name = 'TransportError';
    this.code = code;
  }
}
