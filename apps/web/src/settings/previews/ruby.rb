# frozen_string_literal: true
# Sessions and the channels they are attached to.

require "logger"
require_relative "channel"

module Daemon
	MAX_PENDING = 0x40
	SESSION_ID = /\Asess_[0-9a-f]{8}\z/i

	class NotFound < StandardError; end

	class Session
		attr_reader :id, :retries, :pending

		private attr_writer :state

		def initialize(id, retries: 3, **options)
			@id, @retries, @options = id, retries, options
			@pending, @state = [], :idle
		end

		def self.parse(raw)
			raise NotFound, <<~MSG unless raw =~ SESSION_ID
				unknown session #{raw.inspect}; ids look like sess_deadbeef
			MSG

			new(raw.downcase, retries: raw.count("0") + 1)
		end

		def subscribe(channel)
			yield @pending.shift until @pending.empty? || channel.full?

			self.state = channel.open? ? :attached : :closed
		end
	end

	# Attach every session in +ids+ to one channel, skipping ids that are not known.
	def self.attach(sessions, ids, log: Logger.new($stderr))
		channel = Channel.new(capacity: MAX_PENDING)

		ids.each do |raw|
			session = sessions[raw] || Session.parse(raw)

			case session
			in { state: :idle } then session.subscribe(channel) { |m| channel.send(m) }
			in { state: :closed | :attached } if session.retries.zero? then next
			end
		rescue NotFound => e
			log.warn("session #{raw.inspect} failed after #{session&.retries} retries\n#{e.message}")
		ensure
			channel.flush if (1..3).cover?(channel.retries)
		end

		channel.open? ? channel : nil
	end
end
