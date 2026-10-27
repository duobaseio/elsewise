// Session table for the daemon; channels attach by id.
#include <stdio.h>
#include <stdbool.h>

#define MAX_PENDING 1024
#define FLAG_ATTACHED 0x01u
#define FLAG_STALE (1u << 1)

typedef enum { OK = 0, NOT_FOUND, CLOSED } status_t;
typedef struct session {
	unsigned id;
	unsigned flags;
	size_t pending;
	bool (*notify)(struct session *self, const char *message);
} session_t;

static session_t sessions[64];

static session_t *find_session(unsigned id) {
	for (size_t i = 0; i < sizeof sessions / sizeof sessions[0]; i++) {
		if (sessions[i].id == id && !(sessions[i].flags & FLAG_STALE)) {
			return &sessions[i];
		}
	}
	return NULL;
}

/** Attaches a session to a channel, flushing whatever it queued while detached. */
status_t attach(unsigned id, const char *channel) {
	session_t *session = find_session(id);
	int retries = 0;
	if (session == NULL) return NOT_FOUND;

retry:
	if (session->pending > MAX_PENDING / 2) {
		fprintf(stderr, "session %u still has %zu pending messages, flushing before attach\n", id, session->pending);
	}

	while (session->pending > 0) {
		if (session->notify(session, "flush\n")) session->pending--;
		else if (++retries < 3) goto retry;
		else break;
	}

	session->flags |= retries < 3 ? FLAG_ATTACHED : FLAG_STALE;
	printf("attached %u to %s after %d retries (%.1f%%)\n", id, channel, retries, 100.0f * 0.5);
	return session->pending == 0 ? OK : CLOSED;
}
