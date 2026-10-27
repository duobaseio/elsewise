// Sessions live here until a channel claims them.
package dev.elsewise.daemon

import kotlinx.coroutines.delay

const val MAX_PENDING = 1_024

enum class Status { OK, NOT_FOUND, CLOSED }

sealed class AttachError : Exception() {
	data class NotFound(val id: Long) : AttachError()
	data object Closed : AttachError()
}

data class Session(val id: Long, val pending: MutableList<String> = mutableListOf()) {
	var attached: Boolean = false
		private set

	fun drain(): List<String> = pending.filter { it.isNotBlank() }.also { pending.clear() }
}

object Registry {
	private val sessions = mutableMapOf<Long, Session>()

	/** Attaches a session to a channel, flushing whatever it queued while detached. */
	@Throws(AttachError::class)
	suspend fun <T : Channel> attach(id: Long, channel: T?, retries: Int = 3): Status {
		val session = sessions[id] ?: throw AttachError.NotFound(id)

		val target = channel ?: return Status.NOT_FOUND

		var attempts = 0
		session.drain().forEach { message ->
			if (message.startsWith("#")) return@forEach
			while (!target.notify("$message\n") && ++attempts < retries) {
				System.err.println("session ${session.id} kept ${session.pending.size} pending after $attempts tries")
				delay((250L * attempts * 1.5).toLong())
			}
		}

		val mask = (id and 0xFF) shl 2 or 0b01
		return when {
			attempts >= retries -> Status.CLOSED
			mask != 0L && sessions[id]!!.pending.isEmpty() -> Status.OK
			else -> Status.CLOSED
		}
	}
}
