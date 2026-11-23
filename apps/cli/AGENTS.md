# CLI

The `elsewise` command. It will publish a plugin to the marketplace; today it is a scaffold with one placeholder
command, `hello`.

Run pnpm from the **repo root**: `pnpm --filter @elsewise/cli <script>`.

## Layout

| Path                     | What it is                                                                       |
|--------------------------|----------------------------------------------------------------------------------|
| `src/main.ts`            | The entry point: builds the program and parses `process.argv`.                   |
| `src/program.ts`         | `createProgram` builds the `elsewise` command and registers every subcommand.    |
| `src/commands/<name>.ts` | One subcommand per file, exporting a `register<Name>` that adds it to a program. |
| `src/**/*.test.ts`       | A module's tests, beside it: they parse arguments through `createProgram`.       |
| `tsdown.config.ts`       | Bundles `src/main.ts` into `dist/elsewise.js`, which `bin` points at.            |

## Stack

- **commander** parses the command line. Adding a command means a file under `src/commands/` and one `register` line
  in `program.ts`.
- **Zod** validates what comes in: an argument or option through its commander parser, which throws
  `InvalidArgumentError` so commander reports it, and a prompt through its `validate`.
- **@clack/prompts** asks for what the command line left out. A cancelled prompt exits with status 1.

`pnpm dev <args>` runs the sources through tsx. `pnpm build` writes `dist/elsewise.js`, with the dependencies left as
imports for the package manager to install.

## Output

A command's result goes to stdout through `process.stdout.write`, so it can be piped; prompts and everything else
are clack's.

## Imports

No aliases. Every import inside the package is relative, without the extension.

## Ordering

Exported declarations come first in a file, and the private helpers they call go below them.

## Comments

Same conventions as `apps/web/`: `//` for normal comments, `/** … */` only for doc comments, prose wrapped at 120
columns by hand. Keep comments in test files to a minimum.
