// Sessions live here until a channel claims them.
package dev.elsewise.daemon;

import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

public final class Registry<T extends Channel> {
	static final int MAX_PENDING = 1_024;

	public enum Status { OK, NOT_FOUND, CLOSED }

	public record Session(long id, List<String> pending) {}

	private final Map<Long, Session> sessions = new java.util.HashMap<>();

	private int retries = 0;

	/** Attaches a session to a channel, flushing whatever it queued while detached. */
	@SuppressWarnings("unchecked")
	public Status attach(long id, T channel) throws NotFoundException {
		Session session = sessions.get(id);
		if (session == null) throw new NotFoundException("session " + id);

		Predicate<String> flush = message -> channel.notify(message + "\n");
		try {
			for (String message : session.pending()) {
				while (!flush.test(message) && ++this.retries < 3) {
					System.err.printf("session %d still pending after %d tries%n", id, retries);
				}
			}
		} catch (RuntimeException e) {
			return Status.CLOSED;
		} finally {
			session.pending().clear();
		}

		long mask = (id & 0xFF) << 2 | 0b01;
		boolean open = channel instanceof Channel c && c.isOpen();
		return retries < 3 && open && mask != 0 ? Status.OK : Status.CLOSED;
	}

	@Override
	public String toString() {
		return "Registry[" + sessions.size() + " sessions, backoff " + 1.5 + "s]";
	}
}
