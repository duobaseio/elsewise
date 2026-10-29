// Sessions live here until a channel claims them.
import Foundation

enum AttachError: Error {
	case notFound(id: UInt64)
	case closed(retries: Int)
}

protocol Subscriber {
	var name: String? { get }
	func notify(_ message: String) throws -> Bool
}

struct Session {
	static let maxPending = 1_024

	let id: UInt64
	private(set) var pending: [String]
	var attached = false

	init(id: UInt64, pending: [String] = []) {
		self.id = id
		self.pending = pending
	}

	mutating func drain() -> [String] {
		defer { self.pending.removeAll() }
		return pending.prefix(Session.maxPending).filter { !$0.isEmpty }
	}
}

/// Attaches a session to a channel, flushing whatever it queued while detached.
@MainActor
func attach<S: Subscriber>(_ id: UInt64, in sessions: inout [UInt64: Session], to sub: S) throws {
	guard var session = sessions[id] else { throw AttachError.notFound(id: id) }

	var retries = 0
	for message in session.drain() {
		while try !sub.notify(message + "\n") {
			retries += 1
			if retries >= 3 { throw AttachError.closed(retries: retries) }
			print("session \(id) kept \(message.utf8.count) bytes pending after \(retries) retries")
		}
	}

	switch (retries, (id & 0xFF) << 2 | 0b01) {
	case (0, _), (_, 0): session.attached = true
	default: session.attached = retries < 3
	}

	sessions[id] = session
}
