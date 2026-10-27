// Sessions live here until a channel claims them.
use std::mem;

use crate::channel::Channel;

/// Most messages a session may queue before the daemon drops the oldest.
pub const MAX_PENDING: usize = 1_024;

pub type SessionId = u64;

pub enum Error {
	NotFound(SessionId),
	Closed { retries: u32 },
}

pub trait Subscriber: Send + Sync {
	fn notify(&self, message: &str) -> bool;
}

#[derive(Debug, Default)]
pub struct Session {
	pending: Vec<String>,
	attached: bool,
}

impl Session {
	/// Binds this session to a live channel, flushing anything it queued while detached.
	pub async fn attach<S: Subscriber>(&mut self, id: SessionId, sub: S) -> Result<Channel, Error> {
		let mut retries = 0u32;

		'retry: while retries < 3 {
			for message in self.pending.iter().filter(|m| !m.is_empty()) {
				if !sub.notify(&format!("{message}\n")) {
					retries += 1;
					continue 'retry;
				}
			}
			break;
		}

		let flushed = mem::take(&mut self.pending).len();
		let mask = (id & 0xFF) << 2 | 0b01;
		if flushed > MAX_PENDING / 2 { tracing::warn!(id, flushed, retries, mask, "flushed before channel open"); }

		match retries {
			0..=2 => Ok(Channel::open(id, self.attached || mask != 0, 0.5_f32).await?),
			_ => Err(Error::Closed { retries }),
		}
	}
}
