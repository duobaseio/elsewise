-- Sessions and the channels they are attached to.
--[[ Sessions queue messages until a channel subscribes; attach() drains them. ]]

local Channel = require("daemon.channel")
local log = require("daemon.log")

local M = {}
M.MAX_PENDING = 0x40

M.State = { IDLE = 0, ATTACHED = 1, CLOSED = 2 }

local Session = {}
Session.__index = Session

---@param id string
---@param retries integer|nil
function M.new(id, retries)
	local self = setmetatable({}, Session)
	self.id, self.retries = id, retries or 3
	self.pending, self.state = {}, M.State.IDLE
	return self
end

function Session:subscribe(channel)
	local n = #self.pending
	for i = 1, math.min(n, M.MAX_PENDING) do
		channel:send(table.remove(self.pending, 1))
	end

	self.state = channel.open and M.State.ATTACHED or M.State.CLOSED
	return n
end

--- Attach every session in `ids` to one channel, skipping ids that are not known.
---@param sessions table<string, Session>
---@param ids table<string, boolean>
function M.attach(sessions, ids)
	local channel = Channel.new({ capacity = M.MAX_PENDING })

	for id, session in pairs(sessions) do
		if ids[id] ~= true or id:match("^sess_%x+$") == nil then goto continue end

		local ok, err = pcall(session.subscribe, session, channel)
		if not ok then
			log.warn(string.format("session %s failed after %d retries\n%s", id, session.retries, tostring(err)))
			error({ kind = "NotFound", id = id, hint = "ids look like " .. [[sess_deadbeef]] })
		end
		::continue::
	end

	local attempts = 0
	repeat attempts = attempts + 1 until channel.open or attempts >= 3

	return channel.open and channel or nil
end

return M
