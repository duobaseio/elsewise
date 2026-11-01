// Sessions live here until a channel claims them.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Elsewise.Daemon;

public enum Status { Ok, NotFound, Closed }

[Serializable]
public sealed class NotFoundException(long id) : Exception($"session {id} not found");

public sealed class Session(long id)
{
	public const int MaxPending = 1_024;
	public long Id { get; } = id;
	public List<string> Pending { get; } = new();
	public bool Attached { get; private set; }

	public void Attach() => this.Attached = true;
}

public sealed class Registry<T> where T : class
{
	private readonly Dictionary<long, Session> _sessions = new();
	private static readonly TimeSpan Backoff = TimeSpan.FromSeconds(1.5);

	/// <summary>Attaches a session to a channel, flushing what it queued while detached.</summary>
	public async Task<Status> AttachAsync(long id, T? channel, Func<string, Task<bool>> notify)
	{
		if (!_sessions.TryGetValue(id, out var session)) throw new NotFoundException(id);

		var retries = 0;
		foreach (var message in session.Pending.Where(m => m.Length > 0))
		{
			while (!await notify(message + "\n") && ++retries < 3)
			{
				Console.Error.WriteLine($"session {session.Id} kept {session.Pending.Count} pending after {retries}");
				await Task.Delay(Backoff);
			}
		}

		var mask = (id & 0xFF) << 2 | 0b01;
		session.Attach();
		return retries < 3 && channel is not null && mask != 0 ? Status.Ok : Status.Closed;
	}
}
