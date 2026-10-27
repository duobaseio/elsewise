<!-- Sessions: how the daemon keeps edits alive across restarts. -->

# Sessions

The daemon keeps every *editing session* alive and attaches it to a channel.
Pending edits are **replayed** after a restart; ~~lost edits~~ are no longer a thing.
See the [protocol notes](../architecture/transport.md) or the [session table][sessions].

## Lifecycle

1. A client opens a worktree and receives a session `id`.
2. The session subscribes to `editor.sessions`.
3. Edits queue as `pending` until the channel acknowledges them.

### Retries

- Attempts are bounded by `limits.retries`
	- The first retry waits 250 ms
		- Every further retry multiplies the wait by `backoff_factor`
- [x] Replay after restart
- [ ] Replay across daemons

> Retries never reorder edits.
>> A session with `pending > 0` stays attached until the queue drains, even after the client that opened it is gone.

---

```sql
SELECT id, worktree, pending FROM sessions WHERE attached_at IS NOT NULL;
```

| Session | Worktree     | Pending | Attached at          |
|:--------|:-------------|--------:|:---------------------|
| s-4f2a  | feature/menu |      12 | 2026-09-17T08:41:03Z |
| s-9c10  | main         |       0 |                      |

![Session lifecycle](../design/mockups/session-lifecycle.png)

Status is also published at <https://elsewise.dev/status>.\
The line above ends with a hard break.[^1]

[sessions]: #sessions "The session table"
[^1]: A trailing backslash, so no trailing whitespace is needed.
