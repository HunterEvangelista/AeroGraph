# aerograph

The AeroGraph command-line interface for local-first project knowledge graphs.

## Alpha

AeroGraph CLI is in alpha and requires Bun at runtime. Node.js is not a supported runtime.
Before the first stable release, npm's `latest` tag points to the current alpha so the default
command always starts the supported CLI.

```sh
bunx aerograph --help
bunx aerograph init
bunx aerograph status
```

The CLI is bundled into a single JavaScript artifact and stores its registry under `AEROGRAPH_HOME` (or the default user data location). The CLI is the supported interface in this alpha; no programmatic package API is provided.

## Local execution records

The CLI writes one privacy-safe execution record per invocation to daily JSONL files under
`AEROGRAPH_HOME/logs`. Records contain only a run ID, canonical command name, CLI version,
timestamps, duration, outcome, a coarse error category, and the project-resolution method.
They do not contain arguments, option values, environment variables, paths, project or entity
IDs, titles, tags, prompts, graph content, error messages, stack traces, Effect causes, or SQL
values.

Log files are private to the current user where POSIX permissions are available. Closed files
are retained for at most 14 days and pruned oldest-first when they exceed 50 MiB. Recording is
best-effort: a logging failure never changes command output or exit status. AeroGraph does not
send these records or any other telemetry to a remote service.

## Licensing

AeroGraph is Copyright © Hunter Evangelista and licensed under Apache-2.0. The tarball includes `LICENSE` and the generated `THIRD_PARTY_LICENSES.md` for bundled dependencies.
