# Protobuf

The source of truth for the desktop ↔ daemon protocol. Managed with `buf` (v2; STANDARD lint, WIRE breaking); one
service per file, edition 2024. The rpcs live under `elsewise.daemon` (`elsewise.daemon.git.v1`,
`elsewise.daemon.project.v1`, …); the envelope that multiplexes them lives in `elsewise.transport.v1` and is
implemented per language under `transport/`.

## Line limit

**120 columns, hard** — for every line, code and comment alike. The count includes the indentation and the `// `
prefix, not just the prose after it.

Wrap greedily: each line takes as many whole words as fit, and the next line starts only when the following word would
cross 120. A comment line that could still pull up the first word of the line below it is under-filled — rewrap it.
Reflowing never merges paragraphs: a blank `//` line stays a paragraph break.

```proto
  // Right — the line is filled to the limit before it wraps, and the break falls between words.
  // A base_hash that no longer matches disk fails FAILED_PRECONDITION; the client resolves the conflict by picking one
  // whole file.
```

`buf format` does not rewrap comments, and `buf lint` does not measure line length — both are on you. To check a file:

```sh
awk 'length($0) > 120 { print FILENAME ":" FNR " (" length($0) ")" }' elsewise/daemon/**/*.proto
```

## Doc comments

- An empty response carries no comment at all. `message CreateEntryResponse {}` already says the rpc answers with
  nothing, and the rpc above it says what it did.
- Full sentences, ending in a period, directly above the item — never trailing on the same line.- Lead with what the thing *is*; put protocol rules (ordering, caps, what an empty value means) in a following
  paragraph after a blank `//` line.
- Name an error status only where it changes what the caller does — an `ALREADY_EXISTS` the creation form surfaces, a
  `FAILED_PRECONDITION` that means re-reading before retrying. Never write that failures arrive as error statuses;
  that is true of every rpc.
- Document the `_UNSPECIFIED` zero value as never sent — e.g. `// Never sent; every entry has a type.`

## Field names

- A path on the wire is a **protocol path**: `/`-separated on every platform, whatever the daemon's machine uses.
  Comments say "protocol path", never "`/`-separated".
- A path field is named `relative_path` or `absolute_path`, never `path`. The name says which kind it is, so the
  comment does not have to: an absolute path is a protocol path that is absolute on the daemon's machine, and a
  relative one is a protocol path with no `.` or `..` segment, resolved against a root. `FileSystemService` predates
  the rule and keeps `root` for the absolute path a request works in.
- An enum that classifies its message is `enum Type` in a `type` field, never `kind`.
- A oneof is named for what its members are: `state`, `event`, `source`, `target`, `cause`. `kind` is the fallback
  for members with nothing in common, as in `Envelope`; never `type`.

## Rpc names

Every service uses the same verbs for the same operations:

| Verb     | What it does                                                    | Example                      |
|----------|-----------------------------------------------------------------|------------------------------|
| `Create` | Makes a thing. Never `Add` or `New`.                            | `CreateRemote`               |
| `Get`    | Fetches one thing or a whole collection. Never `List`.          | `GetCommit`, `GetProjects`   |
| `Update` | Changes the fields the request sets and leaves the rest as is.  | `UpdateWorkspace`            |
| `Delete` | Destroys a thing. Never `Remove`.                               | `DeleteWorktree`             |
| `Read`   | Fetches a file's content.                                       | `ReadFile`                   |
| `Write`  | Replaces a file's content.                                      | `WriteFile`                  |
| `Watch`  | Streams a state and every change to it.                         | `WatchStatus`                |

- An operation none of these can name takes its own verb: `MoveEntries`, `RenameBranch`, `AttachTerminal`.
- `GitService` takes that verb from git: `Checkout`, `Fetch`, `PruneWorktrees`, and the stash's `PushStash`,
  `ApplyStash` and `DropStashes`.

## Absent values

A plain value (a string, bytes, a number, a bool) never gives "unset" a meaning of its own. The generated TypeScript
types it as required (`title: string`) and reads an unset field as its default, so only `isFieldSet` could tell the
two apart, and no handler calls it.

- The default is the value for "nothing here", and the comment says so: `// Empty leaves it as is.`,
  `// Empty when unknown.`, `// 0 when unknown.`
- "Unset" is written only on a message field or a `oneof`, which read as `undefined`.
- A plain value whose default is a real value the caller must be able to send gets an explicit third state, as an enum
  whose `_UNSPECIFIED` leaves things as they are. This is the one case where `_UNSPECIFIED` is sent, and its comment
  says what it does: `READ_STATE_UNSPECIFIED = 0; // Leaves the session as it is.`

## Single and bulk rpcs

- **An rpc takes a list when the UI applies it to a selection in one gesture**: deleting, moving, copying, staging,
  discarding. An rpc that always serves one view or one form takes a single item, whether it reads or writes:
  `ReadFile`, `WriteFile`, `CreateBranch`. Several independent items go out as parallel calls.
- **The UI decides, not the verb.** `MoveEntries` takes a list because the file tree drags a selection to another
  folder; `MoveWorktree` takes one because relocating a worktree is a form. A delete that no view applies to a selection
  stays single too: `DeleteWorktree`, `DeleteRemote`.
- **Never make an rpc bulk just in case.** A bulk rpc is added when a caller needs it.
- **One shape per operation.** An operation never has both a single and a bulk rpc.
- A read takes a list only as a filter or a watch set that yields one combined result, as in `GetDiff`'s
  `relative_paths` or `WatchFiles`; never to return several independent results in one response.
- A bulk rpc with a noun in its name takes the plural: `DeleteEntries`, not `DeleteEntry`.
- A bulk rpc that applies its items one by one works through them in order, carries on past an item that fails, and
  reports each in `repeated Failure failures`: the item's key, a `Reason reason` where the caller acts on it, and a
  `message`. One that git applies as a whole, such as `Stage`, fails as a whole with an error status.
- A flag such as `overwrite` or `force` applies to the whole request, never to one item.

## Commands

Run from the repo root:

| Command                            | What it does                                                   |
|------------------------------------|----------------------------------------------------------------|
| `make lint`                        | `buf lint` over `proto/` (plus the other toolchains)           |
| `make generate`                    | regenerates every binding — see the table below                |
| `pnpm --filter web proto:breaking` | checks wire compatibility against `main`                       |

Generated code is never committed — regenerate after any change here.

One generator reads this folder:

| Output                    | Generator       | Lands in                                                                                         | Run by         |
|---------------------------|-----------------|--------------------------------------------------------------------------------------------------|----------------|
| TS messages + descriptors | `protoc-gen-es` | daemon → `apps/daemon/src/gen/`, web → `apps/web/src/gen/`, transport → `transport/ts/src/gen/`  | `buf generate` |
