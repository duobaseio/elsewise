# Agents

Design notes for chatting with coding agents through the daemon, as agreed on 2026-11-12. This is a plan: the contract
is written, the service is not. Delete the note once the service exists and `apps/daemon/AGENTS.md` describes it.

## Status

| Piece                   | Where                                                  | State                          |
| ----------------------- | ------------------------------------------------------ | ------------------------------ |
| Protocol                | `proto/elsewise/daemon/agent/v1/agent_service.proto`   | Written, lints                 |
| Tables                  | `apps/daemon/database/schema.sql`                      | Written, in the migration      |
| Plugin contract         | `packages/daemon-plugin/src/agent.ts`, `mcp-server.ts` | Written                        |
| Registries              | `registry.ts` in this folder and in `../plugins/`      | Written, tested, nothing reads |
| `AgentService`          | `service.ts` in this folder                            | Not started                    |
| Project MCP config file | —                                                      | Decided, not started           |
| An agent plugin         | `plugins/`                                             | Not started                    |
| Chat window             | `apps/web`                                             | Not started                    |

## Shape

```
chat window ── AgentService (our proto) ── daemon ── ACP over stdio ── agent process ── MCP servers
```

- The daemon speaks the Agent Client Protocol (ACP, agentclientprotocol.com) v1 to an agent and our own proto to the
  window. The window never sees ACP.
- An **agent** is a program that speaks ACP. A plugin adds it with `daemon.agents.add({ name, start })`, where
  `start` returns the program, arguments and environment to run. A plugin describes how to launch an agent and never
  drives the protocol. An agent that does not speak ACP is adapted to it inside its plugin.
- A plugin's agent has the plugin's id as its id, so two plugins cannot collide. A plugin that adds more than one gives
  each an `id` of its own, which follows the plugin's: `@scope/name/<id>`. The registry, `agent_session` and the proto
  name an agent by its own id, never as a plugin, so an agent that has no plugin can be added later.
- A **session** is one conversation with an agent in a workspace, a row of `agent_session`.
- One agent process per session. Sharing one process per agent saves memory but one crash takes every session with it;
  revisit if memory becomes a problem.

## Decisions

### Transcripts are not stored

The agent keeps the transcript. `AttachSession` starts the agent if it is not running, the daemon calls `session/load`,
and the replay becomes the items the window gets. The daemon holds a live session's transcript in memory only.

- Why: the common agents all support `session/load`, and opening a chat nearly always means prompting it, which needs
  the agent running anyway. Storing a copy meant a table, a mismatch check and a database that only grows.
- Accepted: a session the agent has pruned is listed but stops with an error when opened; replayed history has no
  timestamps and may show less tool detail than the live turn did; item ids do not outlive the agent's process.
- Needed because of it: the daemon stops an agent that has had no turn running and no client attached for a while.
- An agent that stops while clients are attached ends their `AttachSession` streams, after the session is sent with its
  stopped state and error. Only attaching starts an agent, so an open stream always has one starting or running, and a
  replay only ever reaches a window that has just attached. The window reattaches when the user retries, never by
  itself, or a broken agent would restart in a loop.
- An agent without the `loadSession` capability is not supported. ACP v1 makes it optional, and its `session/resume`
  does not replay.

### What is stored

- `agent_session`: the workspace, the agent's id, the agent's own session id and the title, so the list of sessions
  can be drawn without starting anything.
- One title, the one shown. A title from the agent is taken only while the stored one is empty, so a rename is never
  overwritten; a first turn that ends with no title leaves the first line of its prompt. Accepted: an agent that
  renames a session as it goes shows its first title only.
- Not stored: the config options the agent reports. Opening a session starts the agent, which reports them again, so
  a stopped session has none.
- Not stored: the value the user last chose for a config option. The window remembers it per daemon and agent and
  sends it in `CreateSession`, and the daemon sets it before the first turn. It was a table (`agent_config_option`)
  until it was judged the user's preference at a window, which also keeps it per user once there are several.

### Prompts

- The queue lives in the daemon's memory, apart from the transcript: a prompt becomes a user message only when its turn
  starts. A turn that is cancelled or fails holds the queue until the next prompt is sent. A restart of the daemon drops
  it.
- A queued prompt can be edited, moved and deleted. Every change sends the whole queue again to each attached client, so
  there is one event for all of them.
- Unary rpcs manage sessions from outside (create, rename, mark read, delete, `WatchSessions`). Everything inside a
  session goes through `AttachSession`, a bidirectional stream like `AttachTerminal`: prompts, the queue, cancelling,
  permissions and config options go up, and state comes down.
- A request on the stream gets no reply of its own. One that no longer applies is ignored, and a failure shows as the
  session's state. Not covered: telling one client why its request did nothing (e.g. a config value the agent rejected).
- `CreateSession` starts the agent. The window calls it when a new chat opens, because an agent reports its config
  options (its models among them) only once a session exists. The row of `agent_session` is inserted when the first
  prompt is sent, and a session that was never prompted is dropped when its last client detaches, so an empty chat is
  never listed.

### Context from the window

What the user has open or selected is pushed with the prompt, never pulled by the agent: the window knows it, and the
daemon and the agent do not. It shows in the composer as a chip the user can remove, and the prompt carries it as a
piece of `Content`. The agent is never sent a whole file.

- **A file** is a `Content.Link` with the file's `file://` URI, sent as an ACP resource link. The agent reads the file
  itself. ACP has no type for a file, and agents replay and name files as such links, so the window reads them anyway.
- **A selection** is a `Content.Resource`: the file's `file://` URI followed by `#L<first>:<last>`, with lines counted
  from 1, and the text selected. The text goes along because the buffer may not be saved, so the file on disk may
  differ. It was a type of our own (`Content.Selection`, sent as a text block) until `Content` was made to follow ACP.

`Content` holds ACP's content types and nothing of ours, so the daemon passes a prompt to the agent as it is: a link is
a resource link, and a resource is an embedded resource. It carries every field of theirs but annotations and `_meta`,
which no agent we run sets, and audio, which arrives as `other`.

- ACP says nothing about a line range. `#L45:55` is the form Zed writes, and the Claude and Codex adapters pass a URI
  to the model untouched.
- An agent takes an embedded resource only if it advertises `embeddedContext`, which the Claude and Codex adapters
  both do. For one that does not, the daemon sends a resource link to the same URI. Accepted: such an agent reads the
  lines from disk and misses changes that are not saved.
- Both adapters give the model a resource as the link `[@name](uri)` and the text inside `<context ref="uri">`, and
  replay the two as plain text after `session/load`. Turning that text back into a link and a resource, so a reloaded
  mention is drawn as a chip, is the daemon's to build.

A file that is attached without the user asking for it, such as the tab in focus, is sent as text and not as a link, in
the note Claude Code's IDE integration uses:

```
The user opened the file /absolute/path/to/schema.sql in the IDE. This may or may not be related to the current task.
```

- Not chosen: attaching the file in focus silently, where the user cannot tell what the agent saw; and an MCP server
  the agent asks for editor state, which needs a server in the daemon fed by the window. The second is worth
  revisiting for diagnostics.

### Notifications

ACP has no notification hook, and none is needed: a turn ending and a permission request are already messages the
daemon handles, and `Session` carries both. The window decides when to notify, because only it knows what is on screen.

- The sidebar opens `WatchSessions` for all workspaces once per daemon and rolls sessions up by `workspace_id`. A
  workspace shows the attention icon when any session is `unread`, the one indicator, and otherwise the spinner when
  any is starting or running. Nothing is added to `Workspace`.
- A permission is part of its tool call's item, where the window draws its options. `Session` says nothing of it
  beyond `unread`. Accepted: a question the user has seen and not answered shows the spinner, not the icon.
- `Session.unread` is set by the daemon when the agent asks for a permission, when a turn ends and when the agent
  stops with an error. A turn the user cancelled does not set it, and a turn that ends sets it only once the queue has
  drained or is held. The window clears it through `UpdateSession` when the session is on screen and focused, which
  clears it for every client.
- The window ignores `unread` for the session it is showing, so a turn that ends in view never flashes the icon.
- A session is sent again only for what the sidebar draws. `updated_at` is when the last turn ended, not when the
  transcript last changed, and usage is its own `AttachSession` event, so neither streaming nor an agent that reports
  usage often resends every session. The daemon drops a usage update that changes nothing. Config options and commands
  are `AttachSession` events too, since only the open session draws them.
- It lives in the daemon's memory. A restart stops every agent anyway, so only a marker not yet seen is lost.
- An OS notification is raised on the same two events when the app is not focused or another session is open.
- Not covered: nothing reaches the user while no window is connected, and `unread` is per daemon, not per user. Both
  wait on the backend service and multiple users.

### Agent icons

An agent's icon is an optional SVG document on `agents.add`, which `WatchAgents` sends to the window. It follows the ACP
registry's rule: 16×16, drawn only in `currentColor`, so it follows the theme. The window draws it as a CSS mask
filled with the text colour rather than putting the SVG in the page, so a plugin's SVG cannot carry script.

- Why the daemon and not the plugin's frontend part: the list of agents comes from the daemon, per daemon, so the icon
  arrives with it and nothing has to be matched by id across two separately versioned parts.
- A frontend agents interface is left out until a plugin needs to change how the chat looks. An agent's settings page
  goes through the general settings interface.

### Launch settings and login

- Flags, environment variables and a binary's path are a plugin's own settings, which its `start` turns into the
  process. They are separate from ACP config options, which the agent reports and the chat window changes per session.
  **Missing:** a daemon part cannot read its plugin's settings yet, and such a setting belongs to one daemon's machine.
- Login needs no UI from a plugin. ACP's two methods are generic: the agent opens a browser itself, or the agent is run
  with given arguments in a terminal. The second works on a remote daemon and the first does not. Until that is
  built, `AUTH_REQUIRED` tells the user to log in with the agent's own CLI.

### ACP surface

- Model, mode and thinking level are all ACP config options, shown by category. The deprecated modes are folded into
  the mode category.
- The `fs/*` and `terminal/*` client capabilities are not advertised; agents read and run things themselves.
- No `authenticate` flow. An agent that needs a login stops with the `AUTH_REQUIRED` error type.
- `DeleteSession` removes our row and leaves the agent's own record alone.

### MCP servers

Agents get MCP servers from two places, merged into `mcpServers` when a session is created or loaded:

1. **Plugins**, through `daemon.mcpServers.add({ name, start })`. A `start` that throws leaves the server out.
2. **A config file in the project**, our own (e.g. `.elsewise/mcp.json`) with the same inner shape as `.mcp.json` so
   entries copy across. Values expand `${VAR}` from the daemon's environment, so secrets stay out of the repository.

- Stdio servers only; every ACP agent accepts them, and HTTP ones are an optional capability.
- `name` is the single identifier, readable and simple (`github`, `linear-issues`), because agents put it in tool
  names. It is unique across plugins, and a second `add` with a taken name throws, which fails that plugin.
- A server in the project's file replaces a plugin's of the same name, and each name is sent once. ACP v2 rejects
  duplicate names, and the Claude adapter silently keeps the last.
- ACP has no request to add or remove a server. A session gets the current list whenever the daemon loads or resumes
  it, which does not need the agent's process restarted.
- `.mcp.json` is not read. Claude Code and Codex load that file themselves, so reading it too would hand Claude each
  server twice.
- No table, rpcs or settings screen for user servers. That design was drafted and dropped in favour of the file.

### Scope

A setting goes where its owner is: the project's file when a teammate should get it too (MCP servers), the daemon's
database when it is a session's own (its title), the window when it is the user's preference (the config options
last chosen), and nowhere when the agent already manages it
(instructions, "always allow" rules, commands and skills).

## Open questions

- **Trust in the project's MCP file.** A cloned repository could run any program when a session opens. Ask before a
  project's servers are first used, or show a notice?
- **Validating a server's name** in `add` (lowercase letters, digits, hyphens). Proposed, not decided.
- **Namespacing MCP server names by plugin.** Each plugin now gets its own host object, so the daemon could prefix
  them. Not decided, since agents put the name in tool names. Wanted once there is a marketplace.
- **User-wide MCP servers**, as a second file of the same format in the daemon's data directory.
- **Listing the servers a session got** in the window, with where each came from.
- **Remembered config options per project**, which is now the window's choice of key.
- **`notice` and `elicitation/create`.** ACP lets an agent send a notice for the user (title, severity, description)
  and ask for input through a form or a URL, each behind a client capability. Neither is advertised, and the proto
  has nowhere to put them. Both would count as attention events.

## Deferred

Multiple users and who sent which prompt; authorization (access to a daemon is all or nothing); Docker sandboxes, as
another daemon plus an orchestrator service on the host daemon; the ACP registry; the rpcs for agents the user enters by
hand, whose `agent` table is written (a program, arguments and environment under a generated id); per-turn review and
undo; HTTP MCP servers hosted in the daemon to expose live Elsewise state; ACP v2, which replaces `session/load` with
`session/resume` and a `replayFrom` parameter, so the daemon keeps its reopen-and-replay call in one function.

## To build with the service

- Serialise each session's `session/update` notifications; the SDK does not await handlers in order.
- The idle timeout above.
- Have the agent registry tell `WatchAgents` when an agent is added or removed; it has no listeners yet.
- Start agents with the user's login-shell environment, so their `PATH` and credentials are found.
- Read the project's MCP file and merge it with the plugins' servers.
- Resolve an MCP server's `program` to an absolute path before the agent gets it, which ACP requires of a stdio
  server's command. One that cannot be found leaves the server out of the session.
- Advertise `session.configOptions.boolean` at `initialize`, or agents hold back their on/off options.
- `GetAcpSessions` starts the agent with no session open, calls `session/list` for the workspace's folder and leaves
  out the sessions the workspace already has. An agent without the capability fails it with `UNIMPLEMENTED`, since the
  capability is only known once the agent has started. `CreateSession` with an `Existing` source loads that session
  and inserts its row at once, where a `New` one waits for its first prompt.

## Reference implementations

- **Zed** stores no transcript and relies on `session/load`, runs one process per project and agent, and keeps the
  queue in the window. Closest to this design.
- **Paradev** keeps its own append-only journal, runs one process per chat, and queues on the host.
