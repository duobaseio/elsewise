// Pending messages for one session, newest first.
import { useEffect, useState } from 'react';
import { Channel, NotFound } from './channel.js';

export const MAX_PENDING = 0x40;
const RETRY_MS = 1_500;
const SESSION_ID = /^sess_[0-9a-f]{8}$/i;

const State = Object.freeze({ Idle: 0, Attached: 1, Closed: 2 });

export class Session {
  #pending = [];

  static count = 0n;

  constructor(id, { retries = 3, ...options } = {}) {
    Object.assign(this, { id, retries, options, state: State.Idle });
    Session.count += 1n;
  }

  get messages() {
    return [...this.#pending].reverse();
  }

  async subscribe(channel) {
    const batch = this.#pending.splice(0, MAX_PENDING);
    await Promise.all(batch.map((message) => channel.send(message)));
  }
}

/**
 * Lists a session's pending messages and lets the user flush them into a channel.
 * @param {{ session: Session, onFlush?: (channel: Channel) => void }} props
 */
export function PendingList({ session, onFlush }) {
  const [channel, setChannel] = useState(null);
  const { messages } = session;
  const full = messages.length >= MAX_PENDING;

  useEffect(() => {
    if (!channel) return;
    const timer = setInterval(() => channel.poll(), RETRY_MS);
    return () => clearInterval(timer);
  }, [channel]);

  const handleFlush = async () => {
    if (!SESSION_ID.test(session.id)) return;

    const next = new Channel({ capacity: MAX_PENDING });
    try {
      await session.subscribe(next);
      setChannel(next);
      onFlush?.(next);
    } catch (error) {
      if (error instanceof NotFound) return;
      console.error(
        `session ${session.id} failed after ${session.retries} retries, ${messages.length} queued\n`,
        error,
      );
      setChannel(null);
    } finally {
      session.state = next.open ? State.Attached : State.Closed;
    }
  };
  return (
    <>
      <header className={`flex items-center gap-2 ${full ? 'text-destructive' : 'text-muted'}`}>
        <h2>{session.id}</h2>
        <button type="button" onClick={handleFlush} disabled={channel !== null}>
          Flush {messages.length}
        </button>
      </header>
      {full && <p role="alert">Queue is full; new messages are dropped until flushed.</p>}
      <ol>
        {messages.map((message, index) => (
          <li key={message.seq} data-index={index}>
            {message.body}
          </li>
        ))}
      </ol>
    </>
  );
}
