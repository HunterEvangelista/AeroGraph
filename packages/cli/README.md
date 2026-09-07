# aerograph

The AeroGraph command-line interface for local-first project knowledge graphs.

## Alpha

AeroGraph CLI is in alpha. Bun 1.1.38 or later is the primary runtime, and Node.js 24 or later
is also supported.
Before the first stable release, npm's `latest` tag points to the current alpha so the default
command always starts the supported CLI.

```sh
# Preferred Bun runtime
bunx --bun aerograph --help
bunx --bun aerograph init

# Supported Node.js runtime
npx aerograph --help
npx aerograph init
```

The npm executable uses a Node.js shebang. `bunx --bun` overrides that shebang and explicitly
selects Bun. Both runtimes use the same application code, graph format, and migrations, with
runtime-specific SQLite and Effect platform adapters.

Earlier Bun-only alpha installations continue working until upgraded. After upgrading to the
dual-runtime release, a plain installed `aerograph` command requires Node.js 24 or later.
Bun-only environments should use `bunx --bun aerograph`.

The CLI stores its registry under `AEROGRAPH_HOME` (or the default user data location). The CLI
is the supported interface in this alpha; no programmatic package API is provided.

## Licensing

AeroGraph is Copyright © Hunter Evangelista and licensed under Apache-2.0. The tarball includes `LICENSE` and the generated `THIRD_PARTY_LICENSES.md` for bundled dependencies.
