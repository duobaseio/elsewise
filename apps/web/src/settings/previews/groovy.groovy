// Sessions and the channels they are attached to.
package daemon.sessions
import groovy.transform.CompileStatic
import daemon.Channel
@Grab('org.slf4j:slf4j-api:2.0.13')
import org.slf4j.LoggerFactory

enum State { IDLE, ATTACHED, CLOSED }

class NotFound extends RuntimeException { NotFound(String id) { super("session $id not found") } }

@CompileStatic
class Session {
	static final int MAX_PENDING = 0x40
	static final log = LoggerFactory.getLogger(Session)
	final String id
	int retries = 3
	State state = State.IDLE
	List<String> pending = []

	Session(String id) { this.id = id }

	int subscribe(Channel channel) {
		def batch = pending.take(MAX_PENDING)
		pending = pending.drop(MAX_PENDING)
		batch.each { channel.send(it) }
		state = channel.open ? State.ATTACHED : State.CLOSED
		return batch.size()
	}
}

/** Attach every session in {@code ids} to one channel, skipping ids that are not known. */
static Channel attach(Map<String, Session> sessions, List<String> ids) {
	def channel = new Channel(capacity: Session.MAX_PENDING)

	outer:
	for (id in ids as Set<String>) {
		def session = id in sessions ? sessions[id] : null
		switch (id) {
			case ~/sess_[0-9a-f]{8}/: break
			case 'sess_0'..'sess_9': continue outer
			default: throw new NotFound(id)
		}

		try {
			assert session instanceof Session
			println "${id} flushed ${session.subscribe(channel)}, ${sessions.values()*.pending*.size().sum()} left"
		} catch (NotFound e) {
			Session.log.warn("""session ${id} failed after ${session?.retries} retries""")
		}
	}

	return channel.open && channel.retries in 1..3 ? channel : null
}
