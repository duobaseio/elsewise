import type { MessageInitShape } from '@bufbuild/protobuf';
import { Progress_Phase as Phase, type ProgressSchema } from '../../gen/elsewise/daemon/git/v1/git_pb';

export type ProgressInit = MessageInitShape<typeof ProgressSchema>;

const PHASES: Record<string, Phase> = {
  enumerating: Phase.ENUMERATING,
  counting: Phase.COUNTING,
  compressing: Phase.COMPRESSING,
  writing: Phase.WRITING,
  receiving: Phase.RECEIVING,
  resolving: Phase.RESOLVING,
  unpacking: Phase.UNPACKING,
  updating: Phase.CHECKING_OUT,
  checking: Phase.CHECKING_OUT,
};

/** Reads the progress git writes to stderr during a transfer and reports each change. */
export class ProgressParser {
  readonly #emit: (progress: ProgressInit) => void;
  #pending = '';
  #last = '';

  constructor(emit: (progress: ProgressInit) => void) {
    this.#emit = emit;
  }

  /** Feeds a chunk of stderr. */
  push(chunk: Buffer | string): void {
    const lines = (this.#pending + chunk.toString()).split(/\r\n|\r|\n/);
    this.#pending = lines.pop() ?? '';
    for (const line of lines) {
      this.#parse(line);
    }
  }

  #parse(line: string): void {
    const match = /^(?:remote: )?([A-Za-z]+)[A-Za-z ]*:\s+(\d+)%/.exec(line);
    if (!match) {
      return;
    }
    const phase = PHASES[(match[1] as string).toLowerCase()] ?? Phase.OTHER;
    const percent = Math.min(100, Number(match[2]));
    const key = `${phase}:${percent}`;
    if (key !== this.#last) {
      this.#last = key;
      this.#emit({ phase, percent });
    }
  }
}
