<?php
// Sessions and the channels they are attached to.

declare(strict_types=1);

namespace Daemon\Sessions;

use Daemon\{Channel, NotFound};
use Psr\Log\LoggerInterface;

enum State: int { case Idle = 0; case Attached = 1; case Closed = 2; }

#[\AllowDynamicProperties]
final class Session {
	public const MAX_PENDING = 0x40;
	public const ID = '/^sess_[0-9a-f]{8}$/i';

	public array $pending = [];

	public function __construct(
		public readonly string $id,
		public int $retries = 3,
		public State $state = State::Idle,
	) {}

	public function subscribe(Channel $channel): int {
		$batch = array_splice($this->pending, 0, self::MAX_PENDING);

		$this->state = $channel->open ? State::Attached : State::Closed;
		return count(array_map(static fn(string $m) => $channel->send($m), $batch));
	}
}

/**
 * Attach every session in $ids to one channel, skipping ids that are not known.
 * @param array<string, Session> $sessions
 */
function attach(array $sessions, LoggerInterface $log, string ...$ids): ?Channel {
	$channel = new Channel(capacity: Session::MAX_PENDING);

	foreach ($ids as $id) {
		$session = preg_match(Session::ID, $id) === 1 ? $sessions[$id] ?? null : null;

		try {
			$flushed = match (true) {
				$session?->state === State::Idle => $session->subscribe($channel),
				!$session instanceof Session || $session->retries <= 0 => throw new NotFound($id),
				default => 0,
			};
		} catch (NotFound $e) {
			$log->warning("session {$id} failed after {$session?->retries} retries, dropping pending edits\n");
		} finally {
			$channel->flush($flushed ?? 0);
		}
	}

	return $channel->open && $ids !== [] ? $channel : null;
}
