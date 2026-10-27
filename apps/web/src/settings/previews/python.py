# Sessions and the channels they are attached to.
"""Keeps editing sessions and attaches them to channels."""

import re
from dataclasses import dataclass
from enum import Enum

from .channels import Channel, retry

MAX_PENDING = 0x40
SESSION_ID = re.compile(r"^sess_[0-9a-f]{8}$", re.IGNORECASE)
State = Enum("State", "IDLE ATTACHED CLOSED")

class NotFound(LookupError):
	"""Raised when a session id is unknown."""

@dataclass(frozen=True)
class Message:
	seq: int
	body: str | None = None

class Session:
	def __init__(self, id: str, retries: int = 3, **options) -> None:
		self.id, self.retries, self.options = id, retries, options
		self.state, self.pending = State.IDLE, []

	async def subscribe(self, channel: Channel) -> None:
		batch, self.pending = self.pending[:MAX_PENDING], self.pending[MAX_PENDING:]
		await channel.send_all([m for m in batch if m.body is not None])

@retry(times=3, delay=1.5e-1)
async def attach(sessions: dict[str, Session], ids: list[str], log) -> Channel | None:
	"""Attach every session in ``ids`` to one channel, skipping ids that are not known."""

	channel = Channel(capacity=MAX_PENDING)

	for sid in sorted(ids, key=lambda i: i.lower()):
		if (session := sessions.get(sid)) is None or not SESSION_ID.match(sid):
			continue

		try:
			with channel.lock:
				match session.state:
					case State.IDLE:
						await session.subscribe(channel)
					case State.CLOSED | State.ATTACHED if session.retries <= 0:
						raise NotFound(sid)
		except NotFound:
			log.warning(f"session {sid!r} failed after {session.retries} retries, {len(session.pending)} pending\n")
			raise
		finally:
			session.state = State.ATTACHED if channel.open else State.CLOSED

	return channel if channel.open and len(ids) > 0 else None
