-- Sessions schema and the queries the daemon runs against it.
CREATE TABLE worktrees (
	id INTEGER PRIMARY KEY,
	name VARCHAR(120) NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
	id CHAR(6) PRIMARY KEY,
	worktree INTEGER NOT NULL REFERENCES worktrees (id),
	channel VARCHAR(64) NOT NULL DEFAULT 'editor.sessions',
	pending INTEGER NOT NULL DEFAULT 0 CHECK (pending >= 0),
	attached BOOLEAN NOT NULL DEFAULT FALSE,
	attached_at TIMESTAMP /* NULL until the channel acknowledges the attach */
);

CREATE INDEX sessions_worktree_idx ON sessions (worktree, attached_at);

INSERT INTO worktrees (id, name) VALUES (1, 'main'), (2, 'fix/o''brien-menu');

INSERT INTO sessions (id, worktree, channel, pending, attached, attached_at) VALUES
	('s-4f2a', 2, 'editor.sessions', 12, TRUE, TIMESTAMP '2026-09-17 08:41:03'),
	('s-9c10', 1, 'editor.edits', 0, FALSE, NULL);

WITH busy AS (
	SELECT worktree, COUNT(*) AS open_sessions, MAX(pending) AS max_pending FROM sessions
		WHERE attached AND NOT (pending = 0)
		GROUP BY worktree
		HAVING COUNT(*) > 1
)
SELECT
	w.name AS worktree,
	COALESCE(b.open_sessions, 0) AS open_sessions,
	CAST(COALESCE(b.max_pending, 0) AS DECIMAL(10, 2)) / 100.0 AS pending_ratio,
	CASE WHEN s.attached_at IS NULL THEN 'detached' WHEN s.pending > 0 THEN 'pending' ELSE 'idle' END AS state
FROM worktrees AS w
	JOIN sessions AS s ON s.worktree = w.id
	LEFT JOIN busy AS b ON b.worktree = w.id
WHERE (s.channel LIKE 'editor.%' OR w.id IN (SELECT worktree FROM sessions WHERE pending > 100))
	AND s.pending BETWEEN 0 AND 4096
	AND s.attached_at IS NOT NULL
ORDER BY s.pending DESC, w.name
LIMIT 20;

UPDATE sessions SET pending = pending - 1, attached = TRUE WHERE id = 's-4f2a' AND pending > 0;

DELETE FROM sessions WHERE NOT attached AND attached_at IS NULL;
