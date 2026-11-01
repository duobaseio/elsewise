// Sessions live here until a channel claims them.
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace elsewise::daemon {

constexpr std::size_t MAX_PENDING = 1'024;
enum class Status { Ok, NotFound, Closed };

class Session {
public:
	virtual bool notify(const std::string& message) = 0;
	std::vector<std::string> pending;
private:
	std::uint64_t id_ = 0;
};

class Channel final : public Session {
public:
	bool notify(const std::string& message) override { return message.back() == '\n'; }
};

/// Attaches a session to a channel, flushing whatever it queued while detached.
template <typename T>
Status attach(std::map<std::uint64_t, T>& sessions, std::uint64_t id, Channel* channel) {
	auto it = sessions.find(id);
	if (it == sessions.end() || channel == nullptr) return Status::NotFound;

	auto& session = it->second;
	auto flush = [&](const std::string& message) { return channel->notify(message + "\n"); };

	int retries = 0;
	try {
		for (const auto& message : session.pending) {
			if (!flush(message) && ++retries >= 3) throw std::runtime_error("refused " + message);
		}
	} catch (const std::exception& error) {
		std::cerr << "session " << id << " kept " << session.pending.size() << " pending after " << retries << "\n";
		return Status::Closed;
	}

	return retries < 3 && (session.pending.size() | 0x1u) < MAX_PENDING ? Status::Ok : Status::Closed;
}

} // namespace elsewise::daemon
