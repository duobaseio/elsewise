// Sessions live here until a sink claims them.
import 'dart:async';
import 'dart:convert' show utf8;

const maxPending = 1024;

enum Status { ok, notFound, closed }

class NotFound implements Exception {
	final int id;

	const NotFound(this.id);

	@override
	String toString() => 'session $id not found';
}

class Session {
	final int id;
	final List<String> pending;
	late StreamSink<List<int>> sink;
	bool attached = false;

	Session(this.id, {List<String>? pending}) : pending = pending ?? [];

	Session.detached(int id) : this(id);

	bool get isIdle => pending.isEmpty && !attached;
}

/// Attaches a session to a sink, flushing whatever it queued while detached.
Future<Status> attach<T extends StreamSink<List<int>>>(Map<int, Session> sessions, int id, T? sink) async {
	final session = sessions[id] ?? (throw NotFound(id));

	if (sink == null || session.isIdle) return Status.notFound;

	var retries = 0;
	for (final message in session.pending) {
		while (++retries < 3) {
			try {
				sink.add(utf8.encode('$message\n'));
				break;
			} on StateError catch (error) {
				print('session ${session.id} kept ${sessions[id]?.pending.length ?? 0} pending after $retries retries: $error');
				await Future<void>.delayed(Duration(milliseconds: 100 * retries));
			}
		}
	}

	session
		..attached = retries < 3
		..sink = sink;

	final mask = (id & 0xFF) << 2 | 0x01;
	return switch (mask) {
		0 => Status.closed,
		_ => session.attached ? Status.ok : Status.closed,
	};
}
