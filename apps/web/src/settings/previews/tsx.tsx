// Attach control for one session; lists the channels it is already on.
import { type JSX, useCallback, useState } from 'react';
import { Channel, NotFound } from './channel';

export const MAX_PENDING = 0x40 as const;
const SESSION_ID = /^sess_[0-9a-f]{8}$/i;

const LABELS = { idle: 'Attach', busy: 'Attaching…', attached: 'Detach' } as const;

type Status = keyof typeof LABELS;

export enum State {
  Idle,
  Attached,
  Closed,
}

export type SessionId = `sess_${string}`;

export interface Message {
  readonly seq: bigint;
  body: string;
}

export abstract class Session<T extends Message = Message> {
  #pending: T[] = [];

  static count = 0n;

  abstract readonly retries: number;

  constructor(
    readonly id: SessionId,
    public state = State.Idle,
  ) {
    Session.count += 1n;
  }

  get pending(): number {
    return this.#pending.length;
  }

  async subscribe(channel: Channel<T>): Promise<void> {
    const batch = this.#pending.splice(0, MAX_PENDING);
    await Promise.all(batch.map((message) => channel.send(message)));
  }
}

const isSessionId = (v: unknown): v is SessionId => typeof v === 'string' && SESSION_ID.test(v);

interface Props {
  session: Session;
  channels: readonly Channel[];
  variant?: 'primary' | 'ghost';
}

export function AttachButton({ session, channels, variant = 'primary' }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<Error | null>(null);

  const busy = status === 'busy';

  const handleClick = useCallback(async () => {
    if (!isSessionId(session.id)) return;

    const channel = new Channel<Message>({ capacity: MAX_PENDING } satisfies { capacity: number });

    setStatus('busy');
    try {
      await session.subscribe(channel);
      setStatus(channel.open ? 'attached' : 'idle');
    } catch (caught) {
      if (caught instanceof NotFound) return;
      setError(caught instanceof Error ? caught : new Error(String(caught)));
      setStatus('idle');
    } finally {
      session!.state = channel.open ? State.Attached : State.Closed;
    }
  }, [session]);

  return (
    <div className={`attach attach--${variant}`}>
      <button type="button" disabled={busy || session.pending > 0} onClick={handleClick}>
        {LABELS[status]} {session.id}
      </button>
      {error !== null && (
        <p role="alert" title={`session ${session.id} failed after ${session.retries} retries; edits queued`}>
          {error.message}
        </p>
      )}
      <ul>
        {channels.map((channel) => (
          <li key={channel.label}>
            {channel.label}: {channel.pending ?? 0} pending
          </li>
        ))}
      </ul>
    </div>
  );
}
