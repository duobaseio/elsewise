# Protobuf

The source of truth for the desktop ↔ daemon protocol. Managed with `buf` (v2; STANDARD lint, WIRE breaking); one
service per file, edition 2024. The rpcs live in `elsewise.daemon.v1`; the envelope that multiplexes them lives in
`elsewise.transport.v1` and is implemented per language under `transport/`.

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
awk 'length($0) > 120 { print FILENAME ":" FNR " (" length($0) ")" }' elsewise/daemon/v1/*.proto
```

## Doc comments

- An empty response carries no comment at all. `message CreateEntryResponse {}` already says the rpc answers with
  nothing, and the rpc above it says what it did.
- Full sentences, ending in a period, directly above the item — never trailing on the same line.
- Lead with what the thing *is*; put protocol rules (ordering, caps, what an empty value means) in a following
  paragraph after a blank `//` line.
- Name an error status only where it changes what the caller does — an `ALREADY_EXISTS` the creation form surfaces, a
  `FAILED_PRECONDITION` that means re-reading before retrying. Never write that failures arrive as error statuses;
  that is true of every rpc.
- Document the `_UNSPECIFIED` zero value as never sent — e.g. `// Never sent; every entry has a type.`

## Commands

Run from the repo root:

| Command                            | What it does                                                   |
|------------------------------------|----------------------------------------------------------------|
| `make lint`                        | `buf lint` over `proto/` (plus the other toolchains)           |
| `make generate`                    | regenerates every binding — see the table below                |
| `pnpm --filter web proto:breaking` | checks wire compatibility against `main`                       |

Generated code is never committed — regenerate after any change here.

One generator reads this folder:

| Output                    | Generator       | Lands in                                                             | Run by         |
|---------------------------|-----------------|----------------------------------------------------------------------|----------------|
| TS messages + descriptors | `protoc-gen-es` | daemon → `apps/daemon/src/gen/`, transport → `transport/ts/src/gen/` | `buf generate` |
