# Elsewise

Rules for the whole repository. Each package's own `AGENTS.md` adds to these.

## Rules

- **There is no standalone web version.** Elsewise ships as the desktop app, and `apps/web` is its renderer.
- **Nothing has shipped.** Change a contract, schema or stored format outright; there is no compatibility to keep.
- **Mark stopgaps with `// TODO:`.** Code standing in for a missing mechanism, or working around another library's bug,
  says what replaces it: `// TODO: Bind through a terminal command once commands have a terminal scope.`
- **Write a doc comment over three lines**, even a single sentence: `/**`, then ` * The text.`, then ` */`. Never
  `/** The text. */` on one line.
- **Name a branch `<type>/<slug>`**, with the slug in kebab case and leading with the area when one fits:
  `feature/daemon-exec`, `fix/terminal-resize`, `refactor/proto-naming-consistency`. The type is one of:
  * `feature`: new functionality.
  * `fix`: a bug fix.
  * `refactor`: restructuring or renaming code, contracts included, without changing behaviour.
  * `chore`: dependencies, configuration and tooling.
  * `docs`: documentation only.
  * `ci`: the GitHub workflows.
